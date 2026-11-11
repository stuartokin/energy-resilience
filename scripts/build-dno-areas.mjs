// Builds public/data/dno-areas.json: GB DNO licence-area boundaries from NESO's data portal,
// converted from British National Grid to latitude/longitude and simplified for the web.
// Source: NESO "GIS Boundaries for GB DNO Licence Areas" (NESO Open Data Licence).
// Run automatically by scripts/build-osm-snapshot.mjs during deployment.

import { writeFileSync, mkdirSync } from 'node:fs';
import { processDnoGeoJson } from './dno-geometry.mjs';

const SOURCE = 'https://api.neso.energy/dataset/0e377f16-95e9-4c15-a1fc-49e06a39cfa0/resource/1c6a7dc0-1b6c-443a-bc67-5f7125649434/download/gb-dno-license-areas-20240503-as-geojson.geojson';

export async function buildDnoAreas() {
    console.log('DNO licence areas: downloading from NESO...');
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`NESO returned HTTP ${res.status}`);
    const geojson = await res.json();
    const areas = processDnoGeoJson(geojson).filter(a => a.polygons.length > 0);
    if (areas.length < 10) throw new Error(`Only ${areas.length} areas found - not writing file`);
    mkdirSync('public/data', { recursive: true });
    writeFileSync('public/data/dno-areas.json', JSON.stringify({
        generated: new Date().toISOString(),
        source: 'NESO - GIS Boundaries for GB DNO Licence Areas (2024-05-03)',
        areas,
    }));
    console.log(`DNO licence areas: wrote ${areas.length} areas.`);
}

// Allow running on its own: node scripts/build-dno-areas.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
    buildDnoAreas().catch(e => { console.warn('DNO build failed:', e.message); process.exit(0); });
}
