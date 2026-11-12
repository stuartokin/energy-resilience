# Changelog

Newest first. Mirrored in the app under **Help → What's new** (`content/changelog.ts`).
Versioning: MAJOR = big change in what the app is; MINOR = new features or data sources; PATCH = fixes.

## 3.3.2 - 2026-11-12
- Interconnectors, subsea/OFTO cables and gas pipelines visible at national zoom again; tiles include subsea cables from z3 and pipelines from z4.
- Start-up panels: Regional Network + Live Outages (all screens), Live Systems on >= 1600 px; Data Sync minimised. UK fitted between panels.

## 3.3.1 - 2026-11-12
- No live OpenStreetMap (Overpass) queries on zoom when the weekly tiles are available.

## 3.3.0 - 2026-11-12 - Phase 3 (part 1): MapLibre and every UK energy asset
- Map engine switched from Leaflet to MapLibre GL.
- Weekly vector tiles (PMTiles) of all OSM power and gas infrastructure in the UK, built by Planetiler in GitHub Actions (`scripts/energy-tiles.yml`), cached for the week.
- Zoom-dependent detail; popups for every asset; click a substation to highlight connected lines.
- Falls back to the national snapshot until tiles exist.

## 3.2.0 - 2026-11-12 - Phase 2: any screen, movable panels, new icons
- Panels and the tool dock move (mouse or touch), resize, and have their own A−/A+ and reset; layout remembered per browser.
- Global A−/A+ text size in the top bar.
- Phones / folded foldables: full-screen map, tab bar, bottom-sheet panels. Tablets / unfolded foldables: floating panels, smaller default size. Responsive Help.
- Icon set "engineering shapes" (shape = family, symbol = type); voltage-coloured lines; dashed cables; dotted gas pipes; new power-cut and generator-outage markers; Help → Map legend.
- Status dot reflects real source health.
- Tailwind built into the site instead of the runtime CDN.

## 3.1.0 - 2026-11-12 - Phase 1: real data only, history charts, help and versioning
- Grid demand and frequency history open and show real Elexon data for every range (previously blank; longer ranges were simulated).
- Removed every remaining made-up value (random data-centre sizes and dates, random customer counts, random demand/frequency when a feed failed). Failed feeds show the last real value marked "est.".
- System Status reports whether each source actually answered, and when.
- Local OpenStreetMap detail loads once per area on zoom, not every minute.
- Help: new What's new and About & sources tabs; honest user guide.
- Version, build date and commit stamped at build time.
- Docs: README (how it fits together, updating), CHANGELOG, CLAUDE.md, ATTRIBUTION.md.

## 3.0.0 - 2026-11-11 - Moved off Google AI Studio
- Free keyless map (Leaflet + Esri). Visitors' own Gemini keys for AI.
- Live power cuts from UKPN, Northern Powergrid, NGED, SSEN, SPEN (Cloudflare Worker).
- Elexon REMIT outages, interconnector flows, National Gas, Met Office, Environment Agency, NESO system notices.
- Real NESO DNO boundaries with live regional carbon intensity.
- Weekly OpenStreetMap snapshot via GitHub Actions.
- Removed invented outages, fake connection statuses and supplier guesses; AI output labelled unverified.

## 2.9.2 - 2025-12-21
- Last version built in Google AI Studio (repository `Energy-risk`).
