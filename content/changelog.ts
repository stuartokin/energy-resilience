// What's new - shown in Help > What's new, and mirrored in CHANGELOG.md.
// Add the newest entry at the TOP. Bump APP_VERSION in constants.ts to match.
// Versioning: MAJOR = big change in what the app is; MINOR = new features or data sources; PATCH = fixes.

export interface ChangeEntry { version: string; date: string; title: string; changes: string[]; }

export const CHANGELOG: ChangeEntry[] = [
    {
        version: '3.2.0',
        date: '2026-11-12',
        title: 'Phase 2: works on any screen, movable and resizable panels, new icons',
        changes: [
            'Every panel and the tool dock can be moved (mouse or touch). Panels can be resized from the bottom-right corner and have their own A− / A+ text size and a reset button. Your layout is remembered in this browser; the reset button in View Control restores the defaults.',
            'A− / A+ in the top bar changes the text size of the whole app.',
            'Phones and folded foldables: full-screen map with a tab bar (Grid, Outages, Live, Layers, Risks, Analyst); panels open as a bottom sheet. Tablets and unfolded foldables: floating panels at a slightly smaller default size. Help and other windows adapt to small screens.',
            'New icon set: the outline shape shows the family (circle generation, hexagon storage, square substation, diamond gas network, triangle demand), the symbol shows the type. Small shapes when zoomed out, symbols when zoomed in.',
            'Lines coloured by voltage (400, 275, 132, 33-66, 11 kV); underground and subsea cables dashed; gas pipelines dotted.',
            'Power cuts have a new marker (unplanned cuts pulse; planned work is smaller). Generator outages show as tags with the MW unavailable.',
            'Help → Map legend shows every icon, event marker and line style.',
            'The status dot turns amber or red when data sources stop answering.',
            'Styling is now built into the site (faster, no runtime CDN).',
        ],
    },
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
