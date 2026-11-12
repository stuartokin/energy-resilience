// What's new - shown in Help > What's new, and mirrored in CHANGELOG.md.
// Add the newest entry at the TOP. Bump APP_VERSION in constants.ts to match.
// Versioning: MAJOR = big change in what the app is; MINOR = new features or data sources; PATCH = fixes.

export interface ChangeEntry { version: string; date: string; title: string; changes: string[]; }

export const CHANGELOG: ChangeEntry[] = [
    {
        version: '3.1.0',
        date: '2026-11-12',
        title: 'Phase 1: real data only, history charts, help and versioning',
        changes: [
            'Grid demand and frequency history now open and show real Elexon data for every range (previously blank, and longer ranges were simulated).',
            'Removed every remaining made-up value: random data-centre sizes and dates, random customer counts, random demand and frequency when a feed failed. If a live feed fails, the last real value is shown and marked "est.".',
            'System status now reports whether each data source actually answered, and when, instead of always saying "Operational".',
            'Local OpenStreetMap detail loads once per area when you zoom in, instead of every minute in the background.',
            'New Help tabs: What\'s new, and About & sources (every source, what it is used for, its licence and how often it updates).',
            'Version and build date now come from the published build.',
        ],
    },
    {
        version: '3.0.0',
        date: '2026-11-11',
        title: 'Moved off Google AI Studio: open data, live feeds, no keys or costs',
        changes: [
            'Map rebuilt on free, keyless tiles (Leaflet + Esri dark grey). No Google Maps key.',
            'AI features use each visitor\'s own free Gemini key, kept only in their browser.',
            'Live power cuts from UK Power Networks, Northern Powergrid, NGED, SSEN and SP Energy Networks (via a free Cloudflare Worker).',
            'Live generator and interconnector outages (Elexon REMIT), interconnector flows, gas system (National Gas), Met Office and Environment Agency warnings, NESO system notices.',
            'Real DNO licence-area boundaries (NESO) with live regional carbon intensity and generation mix.',
            'Weekly OpenStreetMap infrastructure snapshot built by GitHub Actions.',
            'Removed invented outages, fake supplier connections and supplier guesses; AI output labelled as unverified web search.',
        ],
    },
    {
        version: '2.9.2',
        date: '2025-12-21',
        title: 'Original Google AI Studio version',
        changes: ['Last version built in Google AI Studio (repository Energy-risk).'],
    },
];
