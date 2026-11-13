// Energy Resilience - live power cuts collector (Cloudflare Worker)
//
// Fetches the live power-cut feeds that browsers can't call directly (they block
// cross-site requests or need an API key), turns them into one common format and
// returns them to the website as a single JSON list.
//
//   NGED  - National Grid Electricity Distribution (Midlands, South West, South Wales)  no key
//   SSEN  - Scottish and Southern Electricity Networks (North Scotland, Southern England) no key
//   SPEN  - SP Energy Networks (Central & South Scotland, Merseyside & North Wales)  needs SPEN_API_KEY
//   (Electricity North West is not included: its live data is published under a restricted "Shared" licence.)
//
// UK Power Networks and Northern Powergrid are fetched by the website directly.
//
// It also serves two other feeds that browsers can't read directly:
//   /gas       - National Gas: live NTS demand, supply, linepack and flows by entry/export point
//   /warnings  - Met Office: current UK weather warnings
//
// It also keeps a history (the "data lake") so the site can chart how the system behaved over time.
// Every 15 minutes (a Cron Trigger) it takes one snapshot of: demand and frequency, generation by fuel and
// interconnector flows (Elexon), gas supply by entry point (National Gas), power cuts from all five
// open network feeds, Met Office warnings and Environment Agency flood warnings. Snapshots are added to one
// record per day in Workers KV (free tier). The site reads them from:
//   /history            - which days are stored
//   /history/day?d=...  - one day (YYYY-MM-DD, UTC)
// Live power-cut feeds disappear once a cut is fixed, so this is the only place that history is kept.
//
// Setup: paste this whole file into a new Cloudflare Worker and deploy.
// Optional secrets (Worker > Settings > Variables and Secrets > Add > Secret):
//   SPEN_API_KEY
// For the history (optional, free):
//   1. Storage & Databases > KV > Create a namespace called energy-lake
//   2. Worker > Settings > Bindings > Add > KV namespace: variable name LAKE, namespace energy-lake
//   3. Worker > Settings > Triggers > Cron Triggers > Add:  */15 * * * *
// Only public, aggregate data is stored: no personal data. Live results are cached for 2 minutes.

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
            '/history': () => historyIndex(env),
            '/history/day': () => historyDay(env, url.searchParams.get('d')),
        };
        const route = routes[url.pathname];
        if (!route) return new Response('Not found', { status: 404, headers: cors });

        // Shared cache so many visitors cause at most one fetch per source every 2 minutes.
        const cache = caches.default;
        const cacheKey = new Request(new URL(`/cache-v3${url.pathname === '/' ? '/outages' : url.pathname}${url.pathname === '/history/day' ? `/${url.searchParams.get('d')}` : ''}`, url).toString());
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

    // Every 15 minutes: add one snapshot to today's history record (needs the LAKE binding)
    async scheduled(event, env, ctx) {
        if (env.LAKE) ctx.waitUntil(snapshot(env));
    },
};

// ---------- National Gas: live NTS flows by entry point, terminal and export (mcm/d), linepack (mcm) ----------
// Source: National Gas Data Portal "latest gas flows" (instantaneous flows, 2-minute readings).
async function fetchGas() {
    const res = await fetch('https://data.nationalgas.com/api/latest-gas-flows-download', {
        headers: { 'User-Agent': 'energy-resilience-worker' },
    });
    if (!res.ok) throw new Error(`National Gas HTTP ${res.status}`);
    // The file has several sections; every data line is: name, published, value, timestamp, ...
    // Keep the most recent reading for each name. Timestamps are "dd/mm/yyyy hh:mm:ss" (UK time).
    const ts = v => { const m = String(v || '').match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : 0; };
    const latest = {};
    for (const line of (await res.text()).split(/\r?\n/)) {
        const c = line.split(',');
        const value = parseFloat(c[2]);
        const t = ts(c[3]);
        if (!c[0] || !t || isNaN(value)) continue;
        if (!latest[c[0]] || t >= latest[c[0]].t) latest[c[0]] = { t, value: Math.round(value * 10) / 10, time: c[3] };
    }
    const pick = n => latest[n] ? latest[n].value : null;
    const TERMINAL = /TERMINAL$/i;
    const SUMMARY = /^(TOTAL SUPPLY|NTS Demand Flow|NTS Actual Linepack|Industrial Demand Flow|Interconnector Export Demand Flow|LDZ Offtake Flow|Power Station Demand Flow|Storage Demand Flow|Bacton BBL Export|Bacton INT Export|Moffat Export)$/;
    const entryPoints = {}, terminals = {};
    for (const [name, v] of Object.entries(latest)) {
        if (SUMMARY.test(name)) continue;
        (TERMINAL.test(name) ? terminals : entryPoints)[name] = v.value;
    }
    return {
        generated: new Date().toISOString(),
        units: 'mcm/d (flows), mcm (linepack)',
        asAt: latest['TOTAL SUPPLY']?.time || latest['NTS Demand Flow']?.time || null,
        ntsDemand: pick('NTS Demand Flow'),
        totalSupply: pick('TOTAL SUPPLY'),
        linepack: pick('NTS Actual Linepack'),
        ldzDemand: pick('LDZ Offtake Flow'),
        powerStations: pick('Power Station Demand Flow'),
        industrial: pick('Industrial Demand Flow'),
        storageInjection: pick('Storage Demand Flow'),
        exports: pick('Interconnector Export Demand Flow'),
        exportsBy: { 'Bacton BBL Export': pick('Bacton BBL Export'), 'Bacton INT Export': pick('Bacton INT Export'), 'Moffat Export': pick('Moffat Export') },
        entryPoints,
        terminals,
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


// =====================================================================================================
// History ("data lake"): one compact record per UTC day in Workers KV, key "day:YYYY-MM-DD".
// Columns: t (HH:MM UTC) and, for each, one value per snapshot (null when a source didn't answer).
// =====================================================================================================
const ELEXON = 'https://data.elexon.co.uk/bmrs/api/v1';

async function historyIndex(env) {
    if (!env.LAKE) return { error: 'History is not set up on the Worker yet (KV binding LAKE and a Cron Trigger).', days: [] };
    return JSON.parse((await env.LAKE.get('index')) || '{"days":[]}');
}
async function historyDay(env, d) {
    if (!env.LAKE) return { error: 'History is not set up' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return { error: 'Give a day as d=YYYY-MM-DD' };
    return JSON.parse((await env.LAKE.get(`day:${d}`)) || 'null') || { error: 'No data for that day' };
}

const pad = (arr, n) => { while (arr.length < n) arr.push(null); return arr; };
const put = (obj, key, i, v) => { const a = pad(obj[key] || (obj[key] = []), i); a[i] = v; };

async function snapshot(env) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(Math.floor(now.getUTCMinutes() / 15) * 15).padStart(2, '0')}`;
    const key = `day:${date}`;
    const day = JSON.parse((await env.LAKE.get(key)) || 'null') || { v: 1, date, t: [], demand: [], freq: {}, fuel: {}, gas: { supply: [], demand: [], linepack: [], entry: {} }, cuts: {}, events: {}, warn: {}, floods: {} };
    if (day.t.includes(hhmm)) return; // already have this slot
    const i = day.t.length;
    day.t.push(hhmm);
    const safe = p => withTimeout(p, 20000).catch(() => null);
    const [fuel, freq, demand, gas, cuts, warnings, floods] = await Promise.all([
        safe(snapFuel()), safe(snapFreq()), safe(snapDemand()), safe(fetchGas()), safe(snapCuts(env)), safe(fetchMetWarnings()), safe(snapFloods()),
    ]);
    put(day, 'demand', i, demand);
    for (const k of ['last', 'min', 'max', 'out']) put(day.freq, k, i, freq ? freq[k] : null);
    if (fuel) for (const [f, mw] of Object.entries(fuel)) put(day.fuel, f, i, mw);
    put(day.gas, 'supply', i, gas?.totalSupply ?? null);
    put(day.gas, 'demand', i, gas?.ntsDemand ?? null);
    put(day.gas, 'linepack', i, gas?.linepack ?? null);
    if (gas) for (const [n, v] of Object.entries({ ...gas.entryPoints, ...gas.terminals })) put(day.gas.entry, n, i, v);
    if (cuts) for (const [dno, c] of Object.entries(cuts)) {
        const o = day.cuts[dno] || (day.cuts[dno] = {});
        put(o, 'c', i, c.ok ? c.customers : null);
        put(o, 'u', i, c.ok ? c.unplanned : null);
        put(o, 'p', i, c.ok ? c.planned : null);
        for (const e of c.events) {
            const ev = day.events[e.id];
            if (ev) { ev.l = hhmm; ev.c = Math.max(ev.c, e.c); }
            else day.events[e.id] = { d: dno, la: e.la, lo: e.lo, c: e.c, p: e.p, f: hhmm, l: hhmm, s: e.s };
        }
    }
    if (warnings) for (const w of warnings.warnings || []) {
        const k = w.title.slice(0, 160);
        if (day.warn[k]) day.warn[k].l = hhmm; else day.warn[k] = { lvl: w.level, type: w.type, f: hhmm, l: hhmm };
    }
    for (const k of ['severe', 'warning', 'alert']) put(day.floods, k, i, floods ? floods[k] : null);
    // Pad every column to the same length
    const n = day.t.length;
    const padAll = o => Object.values(o).forEach(a => Array.isArray(a) && pad(a, n));
    padAll(day); padAll(day.freq); padAll(day.fuel); padAll(day.gas); padAll(day.gas.entry); padAll(day.floods);
    Object.values(day.cuts).forEach(padAll);
    await env.LAKE.put(key, JSON.stringify(day));
    const index = JSON.parse((await env.LAKE.get('index')) || '{"days":[]}');
    if (!index.days.includes(date)) {
        index.days.push(date);
        index.days.sort();
        index.since = index.since || date;
        await env.LAKE.put('index', JSON.stringify(index));
    }
}

// Generation by fuel, including signed interconnector flows (MW, latest 5-minute value)
async function snapFuel() {
    const to = new Date(), from = new Date(to.getTime() - 25 * 60000);
    const json = await (await fetch(`${ELEXON}/datasets/FUELINST?publishDateTimeFrom=${from.toISOString()}&publishDateTimeTo=${to.toISOString()}&format=json`)).json();
    const latest = {};
    for (const r of json.data || json || []) {
        const t = r.startTime || r.publishTime || '';
        if (!latest[r.fuelType] || t >= latest[r.fuelType].t) latest[r.fuelType] = { t, mw: Math.round(r.generation || 0) };
    }
    return Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, v.mw]));
}
// Frequency over the last 15 minutes: latest, min, max and seconds outside 49.8-50.2 Hz (15-second readings)
async function snapFreq() {
    const to = new Date(), from = new Date(to.getTime() - 15 * 60000);
    const json = await (await fetch(`${ELEXON}/system/frequency?from=${from.toISOString()}&to=${to.toISOString()}&format=json`)).json();
    const f = (json.data || []).map(r => r.frequency).filter(x => typeof x === 'number');
    if (!f.length) return null;
    const r3 = x => Math.round(x * 1000) / 1000;
    return { last: r3(f[f.length - 1]), min: r3(Math.min(...f)), max: r3(Math.max(...f)), out: f.filter(x => x < 49.8 || x > 50.2).length * 15 };
}
async function snapDemand() {
    const rows = await (await fetch(`${ELEXON}/demand/outturn/summary?format=json`)).json();
    const list = Array.isArray(rows) ? rows : rows.data || [];
    const last = list[list.length - 1];
    return last?.demand ? Math.round(last.demand) : null;
}
// Environment Agency flood warnings in force, by severity (1 severe, 2 warning, 3 alert)
async function snapFloods() {
    const json = await (await fetch('https://environment.data.gov.uk/flood-monitoring/id/floods')).json();
    const items = json.items || [];
    const n = l => items.filter(x => x.severityLevel === l).length;
    return { severe: n(1), warning: n(2), alert: n(3) };
}
// Power cuts from every open feed: per network, customers off (unplanned), counts, and each cut (no personal data)
async function snapCuts(env) {
    const out = {};
    const add = (dno, ok, list) => {
        const un = list.filter(o => !/^planned/i.test(o.description || ''));
        out[dno] = {
            ok, customers: un.reduce((a, o) => a + (o.consumersAffected || 0), 0), unplanned: un.length, planned: list.length - un.length,
            events: list.map(o => ({ id: o.id, la: Math.round(o.lat * 1000) / 1000, lo: Math.round(o.lng * 1000) / 1000, c: o.consumersAffected || 0, p: /^planned/i.test(o.description || '') ? 1 : 0, s: o.startTime || '' })),
        };
    };
    const [worker, ukpn, npg] = await Promise.all([collectAll(env).catch(() => null), fetchUkpn().catch(() => null), fetchNpg().catch(() => null)]);
    if (worker) for (const src of worker.sources) add(src.id, src.ok, worker.outages.filter(o => o.id.startsWith(`${src.id}_`)));
    add('ukpn', !!ukpn, ukpn || []);
    add('npg', !!npg, npg || []);
    return out;
}
async function fetchUkpn() {
    const json = await (await fetch('https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/ukpn-live-faults/records?limit=100')).json();
    return (json.results || []).filter(r => !r.restoreddatetime && r.geopoint && r.powercuttype !== 'Restored').map(r => ({
        id: `ukpn_${r.incidentreference}`, lat: r.geopoint.lat, lng: r.geopoint.lon,
        consumersAffected: r.nocustomeraffected || r.noplannedcustomers || 0,
        description: r.powercuttype === 'Planned' ? 'Planned work' : 'Unplanned power cut', startTime: r.receiveddate || r.creationdatetime || '',
    }));
}
async function fetchNpg() {
    const fields = 'reference,totalconfirmedpowercut,totalpredictedpowercut,natureofoutage,loggedtime,incidentstatus,lat,lng';
    const rows = await (await fetch(`https://northernpowergrid.opendatasoft.com/api/explore/v2.1/catalog/datasets/live-power-cuts-data/exports/json?select=${fields}&where=incidentstatus!%3D6`)).json();
    const g = new Map();
    for (const r of rows || []) if (typeof r.lat === 'number' && typeof r.lng === 'number' && !g.has(r.reference)) g.set(r.reference, r);
    return [...g.values()].map(r => ({
        id: `npg_${r.reference}`, lat: r.lat, lng: r.lng, consumersAffected: r.totalconfirmedpowercut || r.totalpredictedpowercut || 0,
        description: r.natureofoutage === 'Planned Work on System' ? 'Planned work' : 'Unplanned power cut', startTime: r.loggedtime || '',
    }));
}
