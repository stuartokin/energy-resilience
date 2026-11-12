// Builds public/data/connections.json: which generators and batteries connect to which substation.
// Run automatically during deployment by scripts/build-osm-snapshot.mjs.
//
// Sources (only openly licensed registers are used):
//   NESO TEC Register and Embedded Register (NESO Open Data Licence): transmission-level connection
//     site for every large project, built or in the queue. No coordinates, so matched by name.
//   Embedded Capacity Registers (ECR), 1 MW and above, from DNOs that publish them openly:
//     Northern Powergrid (NPg Open Data Licence v1.0) - no key needed
//     SP Energy Networks (CC BY 4.0) - needs SPEN_API_KEY as a GitHub Actions secret (optional)
//     UK Power Networks (CC BY 4.0)  - needs UKPN_API_KEY as a GitHub Actions secret (optional)
//   DESNZ Renewable Energy Planning Database (REPD, Open Government Licence): renewable and storage
//     projects of 1 MW and above with location and status, to fill areas without an open ECR
//     (NGED, ENWL, SSEN). It does not say which substation a project connects to.
//   Not used: NGED and ENWL publish their ECR under "Shared" data licences, which do not allow
//   republishing on a public website.
// Personal details are dropped: no customer names, MPANs, addresses or postcodes are kept.

import { writeFileSync, mkdirSync } from 'node:fs';
import { osgbToWgs84 } from './dno-geometry.mjs';

const NESO = 'https://api.neso.energy/api/3/action/datastore_search';
const REPD_PAGE = 'https://www.gov.uk/api/content/government/publications/renewable-energy-planning-database-quarterly-extract';
const TEC_RESOURCE = '17becbab-e3e8-473f-b303-3806f43a6a10';
const EMBEDDED_RESOURCE = '68b6f3a1-e1bf-403b-9062-0269fc758d77';

const ECRS = [
    { id: 'npg', name: 'Northern Powergrid ECR (1 MW and above)', host: 'northernpowergrid.opendatasoft.com', dataset: 'embedded-capacity-register', licence: 'Northern Powergrid Open Data Licence v1.0', dno: 'Northern Powergrid' },
    { id: 'spen', name: 'SP Energy Networks ECR (1 MW and above)', host: 'spenergynetworks.opendatasoft.com', dataset: 'embedded-capacity-register', licence: 'CC BY 4.0', dno: 'SP Energy Networks', keyEnv: 'SPEN_API_KEY' },
    { id: 'ukpn', name: 'UK Power Networks ECR (1 MW and above)', host: 'ukpowernetworks.opendatasoft.com', dataset: 'ukpn-embedded-capacity-register', licence: 'CC BY 4.0', dno: 'UK Power Networks', keyEnv: 'UKPN_API_KEY' },
];

const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : null; };
const txt = v => { const s = String(v ?? '').trim(); return !s || /^data not (available|applicable)$/i.test(s) || /^n\/?a$/i.test(s) ? '' : s; };
const r4 = n => Math.round(n * 1e4) / 1e4;
// Short fuel name from the register's long "energy source" wording
const fuel = s => {
    const t = String(s || '').toLowerCase();
    if (/stor|batter/.test(t)) return 'storage';
    if (/solar|photo/.test(t)) return 'solar';
    if (/offshore/.test(t)) return 'wind_offshore';
    if (/wind/.test(t)) return 'wind';
    if (/water|hydro|tidal|wave/.test(t)) return 'hydro';
    if (/landfill|sewage|anaerobic|biogas|biomass|biofuel/.test(t)) return 'biomass';
    if (/waste|efw|incinerat/.test(t)) return 'waste';
    if (/gas/.test(t)) return 'gas';
    if (/oil|diesel/.test(t)) return 'oil';
    if (/nuclear/.test(t)) return 'nuclear';
    return 'other';
};

async function nesoAll(resource) {
    const out = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
        const res = await fetch(`${NESO}?resource_id=${resource}&limit=1000&offset=${offset}`, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`NESO HTTP ${res.status}`);
        const j = await res.json();
        const recs = j.result?.records || [];
        out.push(...recs);
        if (recs.length < 1000) break;
    }
    return out;
}

// CSV parser that copes with quoted fields containing commas and line breaks
function parseCsv(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
        else if (c === '"') q = true;
        else if (c === ',') { row.push(f); f = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
        else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    const h = (rows.shift() || []).map(k => k.replace(/^﻿/, '').replace(/\s+/g, ' ').trim());
    return rows.map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// REPD: latest quarterly CSV (the file name changes each quarter, so find it from the gov.uk page)
const REPD_STATUS = { 'Operational': 'O', 'Under Construction': 'C', 'Awaiting Construction': 'A' };
async function fetchRepd() {
    const page = await (await fetch(REPD_PAGE, { signal: AbortSignal.timeout(30_000) })).json();
    const csv = (page.details?.attachments || []).find(a => /csv/i.test(a.content_type || a.url));
    if (!csv) throw new Error('REPD CSV not found on gov.uk page');
    const res = await fetch(csv.url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`REPD HTTP ${res.status}`);
    const out = [];
    for (const r of parseCsv(await res.text())) {
        const st = REPD_STATUS[r['Development Status (short)']];
        const mw = num(r['Installed Capacity (MWelec)']);
        const E = num(r['X-coordinate']), N = num(r['Y-coordinate']);
        if (!st || mw === null || mw < 1 || !E || !N) continue;
        if (/northern ireland/i.test(r['Country'] || '')) continue; // NI uses the Irish grid, not British National Grid
        if (E <= 0 || N <= 0 || E > 700000 || N > 1300000) continue;
        const [lat, lng] = osgbToWgs84(E, N);
        out.push([r['Site Name'] || 'Unnamed site', r4(lat), r4(lng), fuel(r['Technology Type']), r['Technology Type'] || '', Math.round(mw * 100) / 100, st, r['Operator (or Applicant)'] || '', r['Ref ID'] || '']);
    }
    return { rows: out, title: csv.title, url: csv.url };
}

const km = (a, b) => { const dLat = (a[0] - b[0]) * 111.32, dLng = (a[1] - b[1]) * 111.32 * Math.cos(a[0] * Math.PI / 180); return Math.hypot(dLat, dLng); };

// Find a field by pattern: register column names differ slightly between DNO portals
const pick = (rec, ...patterns) => {
    for (const p of patterns) {
        const k = Object.keys(rec).find(k => p.test(k));
        if (k && txt(rec[k]) !== '') return rec[k];
    }
    return '';
};

async function fetchEcr(src) {
    const key = src.keyEnv ? process.env[src.keyEnv] : '';
    if (src.keyEnv && !key) return { skipped: `no ${src.keyEnv} secret set` };
    const url = `https://${src.host}/api/explore/v2.1/catalog/datasets/${src.dataset}/exports/json` + (key ? `?apikey=${encodeURIComponent(key)}` : '');
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const out = [];
    for (const r of rows) {
        const status = /connected/i.test(txt(pick(r, /connection_status/))) && !/accept/i.test(txt(pick(r, /connection_status/))) ? 'C' : 'A';
        const mw = status === 'C'
            ? num(pick(r, /already_connected_registered_capacity/, /registered_capacity_mw$/))
            : num(pick(r, /accepted_to_connect_registered_capacity/, /technology_1_reg.*capacity/));
        if (mw === null || mw < 1) continue; // 1 MW and above only
        let lat = null, lng = null;
        const gp = r.geopoint || r.geo_point || r.geo_point_2d;
        if (gp && typeof gp === 'object' && isFinite(gp.lat)) { lat = gp.lat; lng = gp.lon; }
        else {
            const E = num(pick(r, /eastings/)), N = num(pick(r, /northings/));
            if (E && N && E > 0 && N > 0 && E < 700000 && N < 1300000) [lat, lng] = osgbToWgs84(E, N);
        }
        if (lat === null) continue;
        out.push([
            txt(pick(r, /customer_site/, /site_name/)) || 'Unnamed site',
            r4(lat), r4(lng),
            txt(pick(r, /grid_supply_point/)), txt(pick(r, /bulk_supply_point/)), txt(pick(r, /^primary/)),
            num(pick(r, /voltage_kv|voltage\(kv\)/)),
            fuel(pick(r, /energy_source_1/) + ' ' + pick(r, /conversion_technology_1/)), txt(pick(r, /conversion_technology_1/)),
            Math.round(mw * 100) / 100, status, src.id,
        ]);
    }
    return { rows: out };
}

export async function buildConnections() {
    console.log('Connections: downloading NESO registers and DNO embedded capacity registers...');
    const sources = [];
    const tec = [];
    for (const [resource, kind, label] of [[TEC_RESOURCE, 'T', 'NESO TEC Register'], [EMBEDDED_RESOURCE, 'E', 'NESO Embedded Register']]) {
        try {
            const recs = await nesoAll(resource);
            for (const r of recs) {
                tec.push([
                    txt(r['Project Name']), txt(r['Connection Site']),
                    num(r['MW Connected']) ?? 0, num(r['Cumulative Total Capacity (MW)']) ?? 0,
                    txt(r['Plant Type']), txt(r['Project Status']), txt(r['HOST TO']),
                    txt(r['MW Effective From']).slice(0, 10), kind,
                ]);
            }
            sources.push({ id: kind === 'T' ? 'tec' : 'embedded', name: label, licence: 'NESO Open Data Licence', records: recs.length, ok: true });
            console.log(`  ${label}: ${recs.length} projects`);
        } catch (e) {
            sources.push({ id: kind === 'T' ? 'tec' : 'embedded', name: label, ok: false, note: e.message });
            console.warn(`  ${label}: ${e.message}`);
        }
    }
    const ecr = [];
    for (const src of ECRS) {
        try {
            const r = await fetchEcr(src);
            if (r.skipped) { sources.push({ id: src.id, name: src.name, ok: false, note: r.skipped }); console.log(`  ${src.name}: skipped (${r.skipped})`); continue; }
            ecr.push(...r.rows);
            sources.push({ id: src.id, name: src.name, licence: src.licence, dno: src.dno, records: r.rows.length, ok: true });
            console.log(`  ${src.name}: ${r.rows.length} sites of 1 MW and above`);
        } catch (e) {
            sources.push({ id: src.id, name: src.name, ok: false, note: e.message });
            console.warn(`  ${src.name}: ${e.message}`);
        }
    }
    // REPD, minus sites already in a DNO register (same fuel within 1 km)
    let repd = [];
    try {
        const r = await fetchRepd();
        const grid = new Map();
        const cell = (lat, lng) => `${Math.round(lat * 50)},${Math.round(lng * 30)}`;
        for (const e of ecr) { const k = cell(e[1], e[2]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(e); }
        const nearEcr = (lat, lng, f) => {
            for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
                const list = grid.get(`${Math.round(lat * 50) + di},${Math.round(lng * 30) + dj}`) || [];
                if (list.some(e => e[7] === f && km([lat, lng], [e[1], e[2]]) < 1)) return true;
            }
            return false;
        };
        repd = r.rows.filter(x => !nearEcr(x[1], x[2], x[3]));
        sources.push({ id: 'repd', name: `DESNZ Renewable Energy Planning Database (${r.title})`, licence: 'Open Government Licence v3.0', records: repd.length, ok: true, note: `${r.rows.length - repd.length} sites already in a DNO register were left out` });
        console.log(`  REPD: ${r.rows.length} sites of 1 MW and above (operational, under or awaiting construction); ${repd.length} not already in a DNO register`);
    } catch (e) {
        sources.push({ id: 'repd', name: 'DESNZ Renewable Energy Planning Database', ok: false, note: e.message });
        console.warn(`  REPD: ${e.message}`);
    }
    if (!tec.length && !ecr.length && !repd.length) throw new Error('no register could be downloaded');
    mkdirSync('public/data', { recursive: true });
    writeFileSync('public/data/connections.json', JSON.stringify({
        built: new Date().toISOString(),
        sources,
        tecFields: ['project', 'connectionSite', 'mwConnected', 'mwTotal', 'plantType', 'status', 'hostTO', 'effectiveFrom', 'register'],
        ecrFields: ['site', 'lat', 'lng', 'gsp', 'bsp', 'primary', 'kV', 'fuel', 'technology', 'mw', 'status', 'dno'],
        repdFields: ['site', 'lat', 'lng', 'fuel', 'technology', 'mw', 'status', 'operator', 'repdId'],
        tec, ecr, repd,
    }));
    console.log(`  wrote public/data/connections.json (${tec.length} NESO projects, ${ecr.length} DNO-connected sites, ${repd.length} REPD sites)`);
}

// Allow running on its own: node scripts/build-connections.mjs
if (import.meta.url === `file://${process.argv[1]}`) buildConnections().catch(e => { console.warn(e.message); });
