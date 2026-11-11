// Builds public/data/bmu-locations.json: where each power station / BM unit is, so that
// Elexon REMIT outage notices (which have no coordinates) can be placed on the map.
// Source: OSUKED Power Station Dictionary (MIT licence), github.com/OSUKED/Power-Station-Dictionary
// Run automatically during deployment by scripts/build-osm-snapshot.mjs.

import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/OSUKED/Power-Station-Dictionary/shiro/data/';

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
    const h = rows.shift() || [];
    return rows.map(r => Object.fromEntries(h.map((k, i) => [k.trim(), r[i] ?? ''])));
}

export async function buildBmuLocations() {
    console.log('BM unit locations: downloading Power Station Dictionary...');
    const [idsText, locText] = await Promise.all([
        fetch(BASE + 'dictionary/ids.csv', { signal: AbortSignal.timeout(60_000) }).then(r => { if (!r.ok) throw new Error(`ids.csv HTTP ${r.status}`); return r.text(); }),
        fetch(BASE + 'attribute_sources/plant-locations/plant-locations.csv', { signal: AbortSignal.timeout(60_000) }).then(r => { if (!r.ok) throw new Error(`locations HTTP ${r.status}`); return r.text(); }),
    ]);
    const loc = Object.fromEntries(parseCsv(locText).map(r => [r.dictionary_id, [Math.round(+r.latitude * 1e4) / 1e4, Math.round(+r.longitude * 1e4) / 1e4]]));
    const sites = []; const units = {};
    for (const r of parseCsv(idsText)) {
        const l = loc[r.dictionary_id];
        if (!l || !isFinite(l[0]) || !isFinite(l[1])) continue;
        const idx = sites.push({ name: r.name, lat: l[0], lng: l[1] }) - 1;
        for (const col of ['sett_bmu_id', 'ngc_bmu_id', 'eic_id']) {
            String(r[col] || '').split(',').map(s => s.trim()).filter(Boolean).forEach(k => { units[k] = idx; });
        }
    }
    if (sites.length < 100) throw new Error(`Only ${sites.length} sites - not writing file`);
    mkdirSync('public/data', { recursive: true });
    writeFileSync('public/data/bmu-locations.json', JSON.stringify({
        generated: new Date().toISOString(),
        source: 'OSUKED Power Station Dictionary (MIT licence)',
        sites, units,
    }));
    console.log(`BM unit locations: wrote ${sites.length} sites, ${Object.keys(units).length} unit IDs.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    buildBmuLocations().catch(e => { console.warn('BM unit locations failed:', e.message); process.exit(0); });
}
