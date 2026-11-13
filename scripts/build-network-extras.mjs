// Builds two extra map datasets in GitHub Actions (needs GDAL's ogr2ogr, installed by the workflow):
//
//  1. public/data/gsp-areas.json
//     Grid Supply Point areas from NESO ("GIS Boundaries for GB Grid Supply Points", NESO Open Data
//     Licence). About 300 areas; used to draw where a scenario's power cuts fall.
//
//  2. public/network/dno-lines.pmtiles (+ public/data/dno-lines-sources.json)
//     33 kV and above overhead lines and underground cables published by the network operators
//     (DNOs). These fill the gaps OpenStreetMap can't see, especially underground cables.
//     Only datasets with an open licence are used; each dataset's licence is checked here and
//     anything marked "Shared" or without an open licence is skipped and logged.
//
// Every step is optional: if a source fails, the app simply doesn't show that layer.
// Run: node scripts/build-network-extras.mjs   (env: UKPN_API_KEY, SPEN_API_KEY optional)

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync, createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';

const WORK = 'work-extras';
const r4 = n => Math.round(n * 1e4) / 1e4;
const ogr = (args) => execFileSync('ogr2ogr', args, { stdio: ['ignore', 'inherit', 'inherit'], timeout: 15 * 60_000 });
const hasOgr = () => { try { execFileSync('ogr2ogr', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } };
const getJson = async (url, ms = 60_000) => { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`HTTP ${r.status} ${url.split('?')[0]}`); return r.json(); };

// ---------- shared geometry helpers ----------
function simplify(points, tol) {
    if (points.length <= 4) return points;
    const sq = tol * tol, keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        let maxD = 0, idx = 0;
        const [x1, y1] = points[a], [x2, y2] = points[b], dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
        for (let i = a + 1; i < b; i++) {
            const [px, py] = points[i];
            let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0; t = Math.max(0, Math.min(1, t));
            const ex = x1 + t * dx - px, ey = y1 + t * dy - py, d = ex * ex + ey * ey;
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > sq) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return points.filter((_, i) => keep[i]);
}
const ringArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s / 2); };
const inRing = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };

// ---------- 1. GSP areas ----------
async function buildGspAreas() {
    console.log('GSP areas: finding the latest NESO boundary file...');
    const pkg = await getJson('https://api.neso.energy/api/3/action/package_show?id=gis-boundaries-gb-grid-supply-points');
    const res = (pkg.result?.resources || [])
        .map(r => ({ ...r, date: (String(r.name || r.url).match(/(20\d{6})/) || [])[1] || '' }))
        .filter(r => r.date && /geojson|zip|json/i.test(`${r.format} ${r.url}`) && !/lookup|gnode|csv/i.test(`${r.name} ${r.url}`))
        .sort((a, b) => b.date.localeCompare(a.date) || (/geojson/i.test(b.format) ? 1 : 0) - (/geojson/i.test(a.format) ? 1 : 0));
    if (!res.length) throw new Error('no GSP boundary resource found');
    const pick = res[0];
    const src = /\.zip(\?|$)/i.test(pick.url) ? `/vsizip//vsicurl/${pick.url}` : `/vsicurl/${pick.url}`;
    const out = `${WORK}/gsp.geojson`;
    ogr(['-f', 'GeoJSON', '-t_srs', 'EPSG:4326', '-lco', 'COORDINATE_PRECISION=5', out, src]);
    const gj = JSON.parse(readFileSync(out, 'utf8'));

    // Name each area by the network operator area it sits in (for "regions" footprints)
    let dno = [];
    try { dno = JSON.parse(readFileSync('public/data/dno-areas.json', 'utf8')).areas || []; } catch { /* built earlier; optional */ }
    const areaOf = (lng, lat) => (dno.find(a => (a.polygons || []).some(p => inRing([lat, lng], p))) || {}).area || '';

    const units = [];
    for (const f of gj.features || []) {
        const g = f.geometry; if (!g) continue;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        const rings = polys.map(p => p[0]).filter(r => ringArea(r) > 0.0004) // drop specks (~ 3 km2)
            .map(r => simplify(r, 0.003).map(([x, y]) => [r4(x), r4(y)])).filter(r => r.length >= 4);
        if (!rings.length) continue;
        const big = rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
        const cx = big.reduce((s, p) => s + p[0], 0) / big.length, cy = big.reduce((s, p) => s + p[1], 0) / big.length;
        const p = f.properties || {};
        const nameKey = Object.keys(p).find(k => /^gsps?$|gsp_?name|gsp/i.test(k) && typeof p[k] === 'string');
        const groupKey = Object.keys(p).find(k => /group/i.test(k) && typeof p[k] === 'string');
        units.push({ id: String(p[nameKey] || `gsp_${units.length}`), group: groupKey ? p[groupKey] : '', area: areaOf(cx, cy), c: [r4(cx), r4(cy)], rings });
    }
    if (units.length < 100) throw new Error(`only ${units.length} GSP areas - not writing`);
    mkdirSync('public/data', { recursive: true });
    writeFileSync('public/data/gsp-areas.json', JSON.stringify({ generated: new Date().toISOString(), source: `NESO GIS Boundaries for GB Grid Supply Points (${pick.name || pick.date})`, licence: 'NESO Open Data Licence', units }));
    console.log(`GSP areas: wrote ${units.length} areas (${pick.name || pick.url})`);
}

// ---------- 2. Network operator lines ----------
const LINE_RX = /(\b|_)(33|66|132)\s*_?kv/i;
const KIND_RX = /(overhead|ohl|underground|_ug|\bug\b|cable|conductor|line)/i;
const SKIP_RX = /(pole|tower|operational|fault|epr|capacity|circuit|monthly|joint|substation|site|switch)/i;
const OPEN_RX = /(cc[ -]?by|open government|open data licen[cs]e|odbl)/i;

const odsPortals = [
    { op: 'UK Power Networks', host: 'ukpowernetworks.opendatasoft.com', key: process.env.UKPN_API_KEY },
    { op: 'Northern Powergrid', host: 'northernpowergrid.opendatasoft.com' },
    { op: 'SP Energy Networks', host: 'spenergynetworks.opendatasoft.com', key: process.env.SPEN_API_KEY },
    { op: 'Electricity North West', host: 'electricitynorthwest.opendatasoft.com' },
];

async function discoverOds(portal) {
    const k = portal.key ? `&apikey=${encodeURIComponent(portal.key)}` : '';
    const out = [];
    for (const term of ['33kv', '66kv', '132kv']) {
        let j;
        try { j = await getJson(`https://${portal.host}/api/explore/v2.1/catalog/datasets?where=search(%22${term}%22)&limit=100${k}`); } catch (e) { console.warn(`  ${portal.op}: catalogue ${e.message}`); continue; }
        for (const d of j.results || []) {
            const id = d.dataset_id, title = d.metas?.default?.title || id;
            const text = `${id} ${title}`;
            if (!LINE_RX.test(text) || !KIND_RX.test(text) || SKIP_RX.test(text)) continue;
            const licence = d.metas?.default?.license || '';
            const metaText = JSON.stringify(d.metas || {});
            if (!OPEN_RX.test(licence) || /"shared"/i.test(metaText)) { console.log(`  skip (licence "${licence || 'none'}"): ${portal.op} ${title}`); continue; }
            if (out.some(o => o.id === id)) continue;
            out.push({ op: portal.op, id, title, licence, url: `https://${portal.host}/api/explore/v2.1/catalog/datasets/${id}/exports/geojson?${k.slice(1)}`, page: `https://${portal.host}/explore/dataset/${id}/` });
        }
    }
    return out;
}

async function discoverNged() {
    const out = [];
    const j = await getJson('https://connecteddata.nationalgrid.co.uk/api/3/action/package_search?q=33kv%20OR%20132kv%20OR%2066kv&rows=100');
    for (const p of j.result?.results || []) {
        const text = `${p.name} ${p.title}`;
        if (!LINE_RX.test(text) || !KIND_RX.test(text + ' ohl ug') || SKIP_RX.test(text)) continue;
        if (!/(ohl|overhead|_ug|underground|cable)/i.test(text)) continue;
        const licence = p.license_title || p.rights || '';
        if (p.dataclassification === 'Shared' || !(p.isopen || OPEN_RX.test(licence))) { console.log(`  skip (licence "${licence}", ${p.dataclassification}): NGED ${p.title}`); continue; }
        const r = (p.resources || []).find(r => /shp|zip|geojson|gpkg/i.test(`${r.format} ${r.url}`) && r.url && r.url !== 'redacted');
        if (!r) continue;
        out.push({ op: 'National Grid Electricity Distribution', id: p.name, title: p.title, licence, url: r.url, page: `https://connecteddata.nationalgrid.co.uk/dataset/${p.name}`, zip: /zip|shp/i.test(`${r.format} ${r.url}`) });
    }
    return out;
}

async function buildDnoLines() {
    const found = [];
    for (const p of odsPortals) { try { found.push(...await discoverOds(p)); } catch (e) { console.warn(`  ${p.op}: ${e.message}`); } }
    try { found.push(...await discoverNged()); } catch (e) { console.warn(`  NGED: ${e.message}`); }
    console.log(`DNO lines: ${found.length} openly licensed datasets found`);
    if (!found.length) throw new Error('no datasets');

    const combined = `${WORK}/dno-lines.geojsons`;
    const outStream = createWriteStream(combined);
    const used = [];
    for (const [i, d] of found.entries()) {
        const tmp = `${WORK}/part${i}.geojsons`;
        const kv = parseInt((`${d.id} ${d.title}`.match(/(33|66|132)\s*_?kv/i) || [])[1], 10) * 1000;
        const ug = /(underground|_ug\b|\bug\b|cable)/i.test(`${d.id} ${d.title}`) ? 1 : 0;
        const src = d.zip ? `/vsizip//vsicurl/${d.url}` : `/vsicurl/${d.url}`;
        try {
            ogr(['-f', 'GeoJSONSeq', '-t_srs', 'EPSG:4326', '-nlt', 'MULTILINESTRING', '-lco', 'COORDINATE_PRECISION=6', tmp, src]);
            let n = 0;
            const rl = createInterface({ input: createReadStream(tmp), crlfDelay: Infinity });
            for await (const line of rl) {
                const t = line.replace(/^\x1e/, '').trim(); if (!t) continue;
                let f; try { f = JSON.parse(t); } catch { continue; }
                if (!f.geometry || !/LineString/.test(f.geometry.type)) continue;
                outStream.write(JSON.stringify({ type: 'Feature', properties: { op: d.op, kv, ug }, geometry: f.geometry }) + '\n');
                n++;
            }
            rmSync(tmp, { force: true });
            used.push({ operator: d.op, dataset: d.title, licence: d.licence, url: d.page, kv, underground: !!ug, features: n });
            console.log(`  ${d.op}: ${d.title} → ${n} features`);
        } catch (e) { console.warn(`  ${d.op}: ${d.title} failed: ${String(e.message || e).slice(0, 160)}`); }
    }
    await new Promise(r => outStream.end(r));
    if (!used.some(u => u.features > 0)) throw new Error('no features converted');
    mkdirSync('public/network', { recursive: true });
    rmSync('public/network/dno-lines.pmtiles', { force: true });
    ogr(['-f', 'PMTiles', '-nln', 'dno_lines', '-dsco', 'MINZOOM=7', '-dsco', 'MAXZOOM=14', 'public/network/dno-lines.pmtiles', combined]);
    writeFileSync('public/data/dno-lines-sources.json', JSON.stringify({ generated: new Date().toISOString(), sources: used }, null, 1));
    console.log(`DNO lines: wrote public/network/dno-lines.pmtiles from ${used.length} datasets`);
}

// ---------- run ----------
if (!hasOgr()) { console.warn('ogr2ogr (GDAL) not installed - skipping GSP areas and DNO lines.'); process.exit(0); }
mkdirSync(WORK, { recursive: true });
const only = process.argv[2];
if (!only || only === 'gsp') { try { await buildGspAreas(); } catch (e) { console.warn('GSP areas skipped:', e.message); } }
if (!only || only === 'lines') { try { await buildDnoLines(); } catch (e) { console.warn('DNO lines skipped:', e.message); } }
rmSync(WORK, { recursive: true, force: true });
