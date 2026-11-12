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
//   Not used: NGED and ENWL publish their ECR under "Shared" data licences, which do not allow
//   republishing on a public website.
// Personal details are dropped: no customer names, MPANs, addresses or postcodes are kept.

import { writeFileSync, mkdirSync } from 'node:fs';
import { osgbToWgs84 } from './dno-geometry.mjs';

const NESO = 'https://api.neso.energy/api/3/action/datastore_search';
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
    if (/waste/.test(t)) return 'waste';
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
    if (!tec.length && !ecr.length) throw new Error('no register could be downloaded');
    mkdirSync('public/data', { recursive: true });
    writeFileSync('public/data/connections.json', JSON.stringify({
        built: new Date().toISOString(),
        sources,
        tecFields: ['project', 'connectionSite', 'mwConnected', 'mwTotal', 'plantType', 'status', 'hostTO', 'effectiveFrom', 'register'],
        ecrFields: ['site', 'lat', 'lng', 'gsp', 'bsp', 'primary', 'kV', 'fuel', 'technology', 'mw', 'status', 'dno'],
        tec, ecr,
    }));
    console.log(`  wrote public/data/connections.json (${tec.length} NESO projects, ${ecr.length} DNO-connected sites)`);
}

// Allow running on its own: node scripts/build-connections.mjs
if (import.meta.url === `file://${process.argv[1]}`) buildConnections().catch(e => { console.warn(e.message); });
