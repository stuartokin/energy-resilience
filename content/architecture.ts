// How the app is built: one description used by the "How it's built" page (components/HowItsBuilt.tsx)
// and summarised in docs/HANDOVER.md. Update it when you add a source, a build step or a major part.
// health = ids from services/health.ts, so the page can show whether each part is working right now.

export type Column = 'source' | 'collect' | 'store' | 'app' | 'see';
export const COLUMNS: { id: Column; title: string; note: string }[] = [
    { id: 'source', title: 'Public sources', note: 'Open data from the people who run the system' },
    { id: 'collect', title: 'Collectors', note: 'Free services that fetch what a web page can\'t' },
    { id: 'store', title: 'Stored data', note: 'Files and records the site reads' },
    { id: 'app', title: 'In your browser', note: 'The app itself: React, TypeScript, MapLibre' },
    { id: 'see', title: 'What you see', note: 'Windows, map and reports' },
];

export interface ArchNode {
    id: string; col: Column; label: string; detail: string;
    files?: string[]; licence?: string; refresh?: string; health?: string[]; to?: string[];
}

export const NODES: ArchNode[] = [
    // ---- Sources ----
    { id: 'elexon', col: 'source', label: 'Elexon (BMRS)', detail: 'Demand, frequency, generation by fuel and interconnector flows (FUELINST), generator outages (REMIT), system warnings.', licence: 'Elexon BMRS data licence', refresh: 'Every 1–5 minutes', health: ['elexon', 'remit', 'mix'], to: ['browser', 'worker'] },
    { id: 'neso', col: 'source', label: 'NESO', detail: 'Carbon intensity and regional mix (API); TEC and Embedded registers, DNO licence areas and Grid Supply Point boundaries (data portal).', licence: 'NESO Open Data Licence / CC BY', refresh: 'Live API; files weekly', health: ['mix'], to: ['browser', 'actions'] },
    { id: 'dnos', col: 'source', label: 'Network operators', detail: 'Live power cuts from UKPN, Northern Powergrid, NGED, SSEN and SPEN; capacity registers; 33 kV+ line data where the licence is open. Electricity North West is excluded (restricted "Shared" licence).', licence: 'Each operator\'s open licence', refresh: 'Live; registers weekly', health: ['ukpn', 'npg'], to: ['browser', 'worker', 'actions'] },
    { id: 'gas', col: 'source', label: 'National Gas', detail: 'Live gas supply by entry point and terminal, demand, linepack and exports.', licence: 'National Gas data terms', refresh: 'About every 12 minutes', to: ['worker'] },
    { id: 'weather', col: 'source', label: 'Met Office and Environment Agency', detail: 'Weather warnings (Met Office RSS) and flood warnings (EA flood monitoring API).', licence: 'Open Government Licence', refresh: 'Live', to: ['worker', 'browser'] },
    { id: 'osm', col: 'source', label: 'OpenStreetMap', detail: 'Every mapped power line, cable, substation, plant and gas pipe in the UK.', licence: 'ODbL', refresh: 'Weekly snapshot and tiles', health: ['tiles', 'snapshot'], to: ['actions'] },
    { id: 'gov', col: 'source', label: 'DESNZ REPD', detail: 'Renewable and storage sites of 1 MW+, used where no network register covers an area.', licence: 'Open Government Licence', refresh: 'Weekly build', to: ['actions'] },
    // ---- Collectors ----
    { id: 'worker', col: 'collect', label: 'Cloudflare Worker', detail: 'Fetches feeds a browser can\'t (CORS or API keys): NGED, SSEN and SPEN power cuts, gas, Met Office. Every 15 minutes it also adds a snapshot of everything to the history store.', files: ['worker/outages-worker.js', 'config.ts'], refresh: 'Live (2-minute cache); snapshots every 15 minutes', health: ['history'], to: ['kv', 'browser'] },
    { id: 'actions', col: 'collect', label: 'GitHub Actions', detail: 'Builds and publishes the site on every upload and every Monday: map tiles (Planetiler), OpenStreetMap snapshot, DNO areas, connection registers, GSP areas and network operator lines (GDAL).', files: ['.github/workflows/deploy.yml', 'scripts/build-osm-snapshot.mjs', 'scripts/build-connections.mjs', 'scripts/build-network-extras.mjs', 'scripts/energy-tiles.yml'], refresh: 'Each publish and weekly', to: ['files'] },
    // ---- Stored ----
    { id: 'files', col: 'store', label: 'Static files on GitHub Pages', detail: 'tiles/energy.pmtiles, network/dno-lines.pmtiles, data/osm-uk.json, data/dno-areas.json, data/gsp-areas.json, data/connections.json, data/bmu-locations.json.', refresh: 'Rebuilt weekly', health: ['tiles', 'dnolines', 'gsp', 'connections'], to: ['browser'] },
    { id: 'kv', col: 'store', label: 'History (Workers KV)', detail: 'One record per day: demand, frequency, generation, imports, gas by entry point, power cuts by network and each cut, warnings. Free tier; no personal data.', files: ['worker/outages-worker.js (snapshot)', 'services/history.ts'], refresh: 'Every 15 minutes', health: ['history'], to: ['browser'] },
    { id: 'gemini', col: 'store', label: 'Google Gemini (your key)', detail: 'Optional. Each visitor uses their own free key, kept in their browser. Used for the analyst, report summaries, scenario proposals and the video briefing. Never supplies scenario numbers.', files: ['services/geminiService.ts', 'services/aiKey.ts'], refresh: 'On request', to: ['browser'] },
    // ---- App ----
    { id: 'browser', col: 'app', label: 'Data services', detail: 'Fetch, check and combine the data; record whether each source answered (System Status).', files: ['services/geminiService.ts', 'services/liveSystems.ts', 'services/flows.ts', 'services/connections.ts', 'services/health.ts'], to: ['model', 'map', 'windows'] },
    { id: 'model', col: 'app', label: 'Scenario model', detail: 'Turns a scenario into customers off over time, energy not supplied and cost. No AI, no random numbers. Every value has a source or stated reasoning.', files: ['content/scenarios.ts', 'content/assumptions.ts', 'services/impactModel.ts', 'services/footprint.ts'], to: ['map', 'windows', 'reports'] },
    // ---- What you see ----
    { id: 'map', col: 'see', label: 'Map', detail: 'MapLibre GL: Esri basemap, OpenStreetMap tiles, operator lines, energy flows, live layers and scenario footprints (red haze, then black).', files: ['components/MapVisualization.tsx', 'components/icons.ts'] },
    { id: 'windows', col: 'see', label: 'Windows', detail: 'Every panel is a window: docked, floating, minimised or closed. Views save the whole set-up to a file or link.', files: ['components/shell/windows.tsx', 'components/panels/*', 'services/views.ts', 'App.tsx'] },
    { id: 'reports', col: 'see', label: 'Reports and briefings', detail: 'Printable live or scenario report (PDF), optional AI summary, video briefing.', files: ['components/ReportBuilder.tsx', 'components/ReportModal.tsx'] },
];

// Layers on the map, bottom to top
export const LAYER_STACK: { name: string; what: string; source: string }[] = [
    { name: 'Basemap', what: 'Dark grey background with coastlines', source: 'Esri World Dark Gray' },
    { name: 'Weather radar', what: 'Rain (when switched on)', source: 'RainViewer' },
    { name: 'Network operator areas', what: 'The 14 licence areas, coloured by operator', source: 'NESO' },
    { name: 'Data coverage', what: 'Hatching where there is no open live power-cut feed', source: 'This app' },
    { name: 'Infrastructure', what: 'Lines, cables, substations, plants, gas pipes', source: 'OpenStreetMap (weekly tiles)' },
    { name: 'Network operator lines', what: '33 kV and above, where OpenStreetMap may be incomplete', source: 'Operators\' open data' },
    { name: 'Connection registers', what: 'Generators and batteries and where they connect', source: 'NESO, operators, DESNZ' },
    { name: 'Place labels', what: 'Towns and cities', source: 'Esri' },
    { name: 'Scenario footprint', what: 'Red haze, then black, on Grid Supply Point areas', source: 'Scenario model (illustrative)' },
    { name: 'Energy flows', what: 'Electricity and gas in and out of GB; routes cut in a scenario', source: 'Elexon, National Gas' },
    { name: 'Live markers', what: 'Power cuts, generator outages, warnings', source: 'Operators, Elexon, Met Office, EA' },
];

// Where a number comes from: three worked examples
export const JOURNEYS: { title: string; steps: { label: string; text: string; file?: string }[] }[] = [
    { title: '"1,000,000 customers off" in the storm scenario', steps: [
        { label: 'Real event', text: 'Storm Arwen (Nov 2021): nearly 1 million homes lost power; 82% back within 24 hours; about 0.4% still off after a week.' },
        { label: 'Source', text: 'Ofgem (2022) review of the networks\' response to Storm Arwen, cited in the scenario.' , file: 'content/scenarios.ts' },
        { label: 'Model', text: 'A "storm" profile builds to the peak over 12 hours (labelled assumption), then follows the sourced restoration figures.', file: 'services/impactModel.ts' },
        { label: 'Cost', text: 'Customers off × 0.31 kW average demand × hours × £16,950/MWh Value of Lost Load (DECC 2013).', file: 'content/assumptions.ts' },
        { label: 'Map', text: 'The share of footprint areas shown black equals customers off ÷ (30 million ÷ number of areas). Which areas is illustrative.', file: 'services/footprint.ts' },
    ] },
    { title: 'A gas flow arrow on the map', steps: [
        { label: 'Source', text: 'National Gas publishes live flows by entry point every few minutes.' },
        { label: 'Collector', text: 'The Cloudflare Worker reads the file (a browser can\'t) and returns the latest value per point.', file: 'worker/outages-worker.js' },
        { label: 'Routes', text: 'Entry points are grouped into routes (e.g. Langeled = Easington Langeled).', file: 'services/flows.ts' },
        { label: 'Units', text: 'mcm/d converted to GW at an assumed 39.5 MJ/m³ (1 mcm/d ≈ 457 MW), so gas and electricity share one scale.' },
        { label: 'Map', text: 'Arrow width = GW; moving dashes show the direction.' , file: 'components/MapVisualization.tsx' },
    ] },
    { title: 'A power-cut marker', steps: [
        { label: 'Source', text: 'Each network operator\'s live feed (five are open; Electricity North West is restricted, Northern Ireland has none connected).' },
        { label: 'Collector', text: 'UKPN and Northern Powergrid are read directly; NGED, SSEN and SPEN through the Worker.' },
        { label: 'Common format', text: 'Every feed is turned into the same record: place, customers, status, estimated restoration.', file: 'services/geminiService.ts' },
        { label: 'History', text: 'Every 15 minutes the Worker also stores it, so the History window can show cuts after they\'re fixed.', file: 'services/history.ts' },
    ] },
];

export const PRINCIPLES: string[] = [
    'Every figure comes from a named public source, or is labelled as an assumption with its reasoning.',
    'Scenario numbers come from a transparent model calibrated on real events. AI never supplies them.',
    'AI output (analyst, summaries, proposals, video) is labelled and not checked.',
    'Scenarios are generic: no named equipment supplier, and no real site as a target. Real past events are used only as reference points.',
    'No data under restricted ("Shared") licences, and no personal data.',
    'System-level views only: the app does not rank individual sites by how much their loss would hurt.',
    'No running costs: free services only; each visitor uses their own Gemini key.',
];
