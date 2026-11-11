// Builds public/data/osm-uk.json: a snapshot of GB energy infrastructure from OpenStreetMap.
// Runs in GitHub Actions before each build (and weekly), so visitors' browsers don't
// have to query the busy public Overpass servers on every page load.
// If every server fails, the script exits without error and the app falls back to live queries.

import { writeFileSync, mkdirSync } from 'node:fs';

const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
];

// Same coverage as the app's "national" view (Great Britain and Northern Ireland).
const BBOX = '49.8,-8.8,60.9,2.0';

const QUERIES = [
    `[out:json][timeout:240];
    (
        node["power"="plant"]["plant:source"~"nuclear|wind|hydro"](${BBOX});
        way["power"="plant"]["plant:source"~"nuclear|wind|hydro"](${BBOX});
        way["power"="line"]["voltage"~"400000|275000|132000|320000"](${BBOX});
        way["power"="cable"]["voltage"~"400000|275000|132000|320000"](${BBOX});
    );
    out geom 4000;`,
    `[out:json][timeout:240];
    (
        node["power"="cable"]["location"="underwater"](${BBOX});
        way["power"="cable"]["location"="underwater"](${BBOX});
        node["man_made"="pipeline"]["substance"="gas"]["location"="underwater"](${BBOX});
        way["man_made"="pipeline"]["substance"="gas"]["location"="underwater"](${BBOX});
    );
    out geom 800;`,
];

const KEEP_TAGS = ['name', 'operator', 'power', 'voltage', 'plant:source', 'generator:source',
    'plant:output:electricity', 'location', 'man_made', 'substance', 'telecom', 'building', 'start_date'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r5 = n => Math.round(n * 1e4) / 1e4; // ~11 m precision keeps the file small

async function runQuery(query) {
    for (let attempt = 0; attempt < 3; attempt++) {
        for (const url of ENDPOINTS) {
            try {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 300_000);
                const res = await fetch(url, {
                    method: 'POST',
                    body: 'data=' + encodeURIComponent(query),
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'energy-resilience-snapshot (GitHub Actions)' },
                    signal: ctrl.signal,
                });
                clearTimeout(t);
                if (res.ok) {
                    const json = await res.json();
                    console.log(`  ${new URL(url).host}: ${json.elements?.length ?? 0} elements`);
                    return json.elements || [];
                }
                console.warn(`  ${new URL(url).host}: HTTP ${res.status}`);
            } catch (e) {
                console.warn(`  ${new URL(url).host}: ${e.message}`);
            }
        }
        await sleep(20_000 * (attempt + 1));
    }
    return null;
}

const slim = el => {
    const tags = {};
    for (const k of KEEP_TAGS) if (el.tags?.[k] !== undefined) tags[k] = el.tags[k];
    const out = { type: el.type, id: el.id, tags };
    if (el.type === 'node') { out.lat = r5(el.lat); out.lon = r5(el.lon); }
    if (Array.isArray(el.geometry)) out.geometry = el.geometry.map(p => ({ lat: r5(p.lat), lon: r5(p.lon) }));
    else if (el.center) out.center = { lat: r5(el.center.lat), lon: r5(el.center.lon) };
    else if (el.bounds) out.bounds = el.bounds;
    return out;
};

const all = [];
for (const [i, q] of QUERIES.entries()) {
    console.log(`Query ${i + 1}/${QUERIES.length}...`);
    const els = await runQuery(q);
    if (els) all.push(...els);
}

const seen = new Set();
const elements = all.filter(e => (seen.has(`${e.type}${e.id}`) ? false : seen.add(`${e.type}${e.id}`))).map(slim);

if (elements.length === 0) {
    console.warn('No data from any Overpass server - skipping snapshot (app will use live queries).');
    process.exit(0);
}

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/osm-uk.json', JSON.stringify({
    generated: new Date().toISOString(),
    source: 'OpenStreetMap contributors (ODbL), via Overpass API',
    elements,
}));
console.log(`Wrote public/data/osm-uk.json with ${elements.length} elements.`);
