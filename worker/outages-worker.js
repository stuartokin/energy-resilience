// Energy Resilience - live power cuts collector (Cloudflare Worker)
//
// Fetches the live power-cut feeds that browsers can't call directly (they block
// cross-site requests or need an API key), turns them into one common format and
// returns them to the website as a single JSON list.
//
//   NGED  - National Grid Electricity Distribution (Midlands, South West, South Wales)  no key
//   SSEN  - Scottish and Southern Electricity Networks (North Scotland, Southern England) no key
//   SPEN  - SP Energy Networks (Central & South Scotland, Merseyside & North Wales)  needs SPEN_API_KEY
//   ENWL  - Electricity North West (North West England)  needs ENWL_API_KEY
//
// UK Power Networks and Northern Powergrid are fetched by the website directly.
//
// It also serves two other feeds that browsers can't read directly:
//   /gas       - National Gas: live NTS demand, supply and linepack
//   /warnings  - Met Office: current UK weather warnings
//
// Setup: paste this whole file into a new Cloudflare Worker and deploy.
// Optional secrets (Worker > Settings > Variables and Secrets > Add > Secret):
//   SPEN_API_KEY, ENWL_API_KEY
// Nothing else is stored. Results are cached for 2 minutes to be kind to the DNOs.

const ALLOWED_ORIGINS = [
    'https://stuartokin.github.io',
    'http://localhost:3000',
    'http://localhost:4173',
];

const CACHE_SECONDS = 120;

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get('Origin') || '';
        const cors = {
            'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Vary': 'Origin',
        };
        if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

        const url = new URL(request.url);
        const routes = {
            '/': () => collectAll(env),
            '/outages': () => collectAll(env),
            '/gas': () => fetchGas(),
            '/warnings': () => fetchMetWarnings(),
        };
        const route = routes[url.pathname];
        if (!route) return new Response('Not found', { status: 404, headers: cors });

        // Shared cache so many visitors cause at most one fetch per source every 2 minutes.
        const cache = caches.default;
        const cacheKey = new Request(new URL(`/cache-v2${url.pathname === '/' ? '/outages' : url.pathname}`, url).toString());
        let cached = await cache.match(cacheKey);
        if (!cached) {
            let body;
            try { body = JSON.stringify(await route()); }
            catch (e) { body = JSON.stringify({ error: String(e.message || e).slice(0, 200) }); }
            cached = new Response(body, {
                headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
            });
            ctx.waitUntil(cache.put(cacheKey, cached.clone()));
        }
        const res = new Response(cached.body, cached);
        Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
        return res;
    },
};

// ---------- National Gas: live NTS flows (mcm/day) and linepack (mcm) ----------
async function fetchGas() {
    const ids = '591,558,601,602,585,586,583,603,584,587,588';
    const day = new Date().toISOString().slice(0, 10);
    const res = await fetch('https://data.nationalgas.com/api/customisable-downloads-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'energy-resilience-worker' },
        body: JSON.stringify({ ids, fromDate: day, toDate: day, isLatest: true, predefinedDate: 'Latest Update', type: 'CSV' }),
    });
    if (!res.ok) throw new Error(`National Gas HTTP ${res.status}`);
    const rows = parseCsv(await res.text());
    // Keep the most recent reading for each measure. Timestamps are "dd/mm/yyyy hh:mm:ss" (UK time).
    const ts = v => { const m = String(v || '').match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : 0; };
    const latest = {};
    for (const r of rows) {
        const name = r['System Entry Name'];
        if (!name) continue;
        const t = ts(r['Timestamp']);
        if (!latest[name] || t > latest[name].t) latest[name] = { t, value: parseFloat(r['Value']), time: r['Timestamp'] };
    }
    const pick = n => latest[n] ? Math.round(latest[n].value * 10) / 10 : null;
    return {
        generated: new Date().toISOString(),
        units: 'mcm/d (flows), mcm (linepack)',
        asAt: latest['NTS Demand Flow']?.time || null,
        ntsDemand: pick('NTS Demand Flow'),
        totalSupply: pick('TOTAL SUPPLY'),
        linepack: pick('NTS Actual Linepack'),
        ldzDemand: pick('LDZ Offtake Flow'),
        powerStations: pick('Power Station Demand Flow'),
        industrial: pick('Industrial Demand Flow'),
        storageInjection: pick('Storage Demand Flow'),
        exports: pick('Interconnector Export Demand Flow'),
    };
}

// ---------- Met Office: current UK weather warnings (RSS) ----------
async function fetchMetWarnings() {
    const res = await fetch('https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/UK', {
        headers: { 'User-Agent': 'energy-resilience-worker' },
    });
    if (!res.ok) throw new Error(`Met Office HTTP ${res.status}`);
    const xml = await res.text();
    const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
    return {
        generated: new Date().toISOString(),
        warnings: items.map(it => {
            const title = tag(it, 'title');
            const level = (title.match(/^(Yellow|Amber|Red)/i) || [])[1] || 'Yellow';
            const type = (title.match(/warning of (.+?) affecting/i) || [])[1] || '';
            const region = (title.match(/affecting (.+)$/i) || [])[1] || '';
            return { title, level, type, region, description: tag(it, 'description'), link: tag(it, 'link'), published: tag(it, 'pubDate') };
        }),
    };
}

async function collectAll(env) {
    const sources = [
        { id: 'nged', name: 'National Grid Electricity Distribution', run: () => fetchNged() },
        { id: 'ssen', name: 'Scottish and Southern Electricity Networks', run: () => fetchSsen() },
        { id: 'spen', name: 'SP Energy Networks', key: 'SPEN_API_KEY', run: () => fetchNeoOds(
            'https://spenergynetworks.opendatasoft.com', 'national-energy-outage-data', env.SPEN_API_KEY, 'SP Energy Networks', 'spen', {
                customers: null, postcode: 'post_code', start: ['date_of_reported_fault', 'planned_outage_start_date'], restored: 'date_of_restoration',
            }) },
        { id: 'enwl', name: 'Electricity North West', key: 'ENWL_API_KEY', run: () => fetchNeoOds(
            'https://electricitynorthwest.opendatasoft.com', 'sp-enw-live-neop', env.ENWL_API_KEY, 'Electricity North West', 'enwl', {
                customers: 'confirmedoff', postcode: 'postcode', start: ['outage_start_date'], restored: 'date_time_of_restoration',
            }) },
    ];

    const results = await Promise.all(sources.map(async s => {
        if (s.key && !env[s.key]) return { id: s.id, name: s.name, ok: false, count: 0, error: `Not connected (add ${s.key})`, outages: [] };
        try {
            const outages = await withTimeout(s.run(), 15000);
            return { id: s.id, name: s.name, ok: true, count: outages.length, outages };
        } catch (e) {
            return { id: s.id, name: s.name, ok: false, count: 0, error: String(e.message || e).slice(0, 200), outages: [] };
        }
    }));

    return {
        generated: new Date().toISOString(),
        sources: results.map(({ outages, ...rest }) => rest),
        outages: results.flatMap(r => r.outages),
    };
}

// ---------- NGED (CKAN, CSV in the National Energy Outage format) ----------
async function fetchNged() {
    const csvUrl = 'https://connecteddata.nationalgrid.co.uk/dataset/d6672e1e-c684-4cea-bb78-c7e5248b62a2/resource/a1365982-4e05-463c-8304-8323a2ba0ccd/download/live_detailed_power_cuts.csv';
    let res = await fetch(csvUrl, { headers: { 'User-Agent': 'energy-resilience-worker' } });
    if (!res.ok) {
        // Resource URL changed? Look it up from the dataset.
        const meta = await (await fetch('https://connecteddata.nationalgrid.co.uk/api/3/action/package_show?id=live-power-cuts')).json();
        const r = meta.result?.resources?.find(x => x.name === 'Live Detailed Power Cuts');
        if (!r) throw new Error(`NGED feed not found (HTTP ${res.status})`);
        res = await fetch(r.url);
        if (!res.ok) throw new Error(`NGED HTTP ${res.status}`);
    }
    const rows = parseCsv(await res.text());
    const byId = new Map();
    for (const r of rows) {
        if (/restored|complete/i.test(r.status || '') || r.date_of_restoration) continue;
        const lat = parseFloat(r.location_latitude), lng = parseFloat(r.location_longitude);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const prev = byId.get(r.fault_id);
        if (prev) { prev._pc.push(r.postcode); continue; }
        const planned = String(r.planned).toLowerCase() === 'true';
        byId.set(r.fault_id, {
            id: `nged_${r.fault_id}`,
            locationName: r.licence_area || 'NGED area',
            lat, lng,
            consumersAffected: num(r.confirmed_off) || num(r.planned_outage_off) || num(r.predicted_off),
            description: planned ? `Planned work (${r.voltage || 'network'})` : `Unplanned power cut (${r.voltage || 'network'})`,
            startTime: ukLocal(r.date_of_reported_fault || r.planned_outage_start_date),
            estRestoration: ukLocal(r.etr || r.planned_outage_end_date) || 'TBC',
            source: 'NGED (live)',
            status: planned ? 'Active' : statusFrom(r.status),
            isSimulated: false,
            _pc: [r.postcode],
        });
    }
    return [...byId.values()].map(finishPostcodes);
}

// ---------- SSEN (Power Track JSON) ----------
async function fetchSsen() {
    const res = await fetch('https://external.distribution.prd.ssen.co.uk/opendataportal-prd/v4/api/getallfaults', {
        headers: { 'User-Agent': 'energy-resilience-worker', 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`SSEN HTTP ${res.status}`);
    const json = await res.json();
    return (json.faults || [])
        .filter(f => f.location && isFinite(f.location.latitude) && isFinite(f.location.longitude))
        .map(f => {
            const planned = f.type === 'PSI';
            const area = f.location.latitude > 55 ? 'North of Scotland' : 'Southern England';
            return {
                id: `ssen_${f.reference}`,
                locationName: `${f.title || area}${f.affectedAreas?.length ? ` (${f.affectedAreas.slice(0, 3).join(', ')}${f.affectedAreas.length > 3 ? ` +${f.affectedAreas.length - 3}` : ''})` : ''}`,
                lat: f.location.latitude,
                lng: f.location.longitude,
                consumersAffected: num(f.customerCount),
                description: planned ? 'Planned work' : `Unplanned power cut (${f.type})${f.message ? ` - ${String(f.message).slice(0, 160)}` : ''}`,
                startTime: f.loggedAtUtc || '',
                estRestoration: f.estimatedRestorationTimeUtc || 'TBC',
                source: 'SSEN (live)',
                status: planned ? 'Active' : (f.engineerOnSiteTimeUtc ? 'Restoring' : 'Investigating'),
                isSimulated: false,
            };
        });
}

// ---------- SPEN / ENWL (Opendatasoft, National Energy Outage format, API key) ----------
async function fetchNeoOds(base, dataset, apiKey, label, prefix, f) {
    const res = await fetch(`${base}/api/explore/v2.1/catalog/datasets/${dataset}/exports/json?timezone=UTC`, {
        headers: { Authorization: `Apikey ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) throw new Error(`${label}: API key rejected (HTTP ${res.status})`);
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`${label}: unexpected response`);
    const byId = new Map();
    for (const r of rows) {
        if (/restored|complete/i.test(r.status || '') || r[f.restored]) continue;
        let lat = parseFloat(r.location_latitude), lng = parseFloat(r.location_longitude);
        if ((!isFinite(lat) || !isFinite(lng)) && r.geo_point_2d) { lat = r.geo_point_2d.lat; lng = r.geo_point_2d.lon; }
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const prev = byId.get(r.fault_id);
        if (prev) { prev._pc.push(r[f.postcode]); continue; }
        const planned = String(r.planned).toLowerCase() === 'true' || r.planned === true;
        const start = f.start.map(k => r[k]).find(Boolean);
        byId.set(r.fault_id, {
            id: `${prefix}_${r.fault_id}`,
            locationName: r.licence_area || label,
            lat, lng,
            consumersAffected: f.customers ? num(r[f.customers]) : 0,
            description: planned ? `Planned work (${r.voltage || r.voltagelevel || 'network'})` : `Unplanned power cut (${r.voltage || r.voltagelevel || 'network'})`,
            startTime: start || '',
            estRestoration: r.etr || 'TBC',
            source: `${label} (live)`,
            status: planned ? 'Active' : statusFrom(r.status),
            isSimulated: false,
            _pc: [r[f.postcode]],
        });
    }
    return [...byId.values()].map(finishPostcodes);
}

// ---------- helpers ----------
function finishPostcodes(o) {
    const pcs = [...new Set(o._pc.flatMap(p => String(p || '').split(/[,;]/)).map(p => p.trim()).filter(Boolean))];
    delete o._pc;
    if (pcs.length) o.locationName += ` (${pcs.slice(0, 3).join(', ')}${pcs.length > 3 ? ` +${pcs.length - 3}` : ''})`;
    return o;
}

function statusFrom(s) {
    s = String(s || '').toLowerCase();
    if (s.includes('progress') || s.includes('restoring')) return 'Restoring';
    if (s.includes('await') || s.includes('investigat')) return 'Investigating';
    return 'Active';
}

const num = v => { const n = parseInt(v, 10); return isFinite(n) ? n : 0; };

// NGED timestamps have no time zone and are UK local time; return as-is with a marker.
const ukLocal = v => (v ? `${v} (UK time)` : '');

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`Timed out after ${ms / 1000}s`)), ms))]);
}

// Minimal CSV parser (handles quoted fields, commas and line breaks inside quotes).
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') q = false;
            else field += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const head = rows.shift() || [];
    return rows.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}
