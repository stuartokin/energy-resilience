# Changelog

Newest first. Mirrored in the app under **Help → What's new** (`content/changelog.ts`).
Versioning: MAJOR = big change in what the app is; MINOR = new features or data sources; PATCH = fixes.

## 4.0.0 - 2026-11-13 - New layout: modes, standard windows, report builder
- `components/shell/windows.tsx`: window manager (docked / floating / minimised / closed), side panel with tabs, floating windows (drag, resize, text size), minimised tray, tool rail, phone tab bar and sheet. Layout saved in localStorage (`energy_resilience_windows_v1`).
- `components/panels/LivePanels.tsx` (Overview, Electricity, Outages) and `components/panels/ScenarioPanels.tsx` (Library, Results, Model; Model also used in Help).
- `components/ReportBuilder.tsx`: printable live or scenario report, A4 print CSS, map snapshot (MapLibre `preserveDrawingBuffer`), 24 h demand chart, optional AI summary/mitigations via `generateReportText`.
- App.tsx: old floating panels, dock and pinning replaced by the new shell; Live | Scenarios mode switch; timeline under the map; Video briefing, Analyst AI and Create report in the top bar.
- ChatPanel `embedded` prop; video script now given each scenario's reasoning.

## 3.6.0 - 2026-11-12 - Planning database sites and inferred connections
- `build-connections.mjs` adds REPD (DESNZ, OGL): latest quarterly CSV found via the gov.uk content API; operational, under construction and awaiting construction, 1 MW+, GB only; sites within 1 km of a same-fuel ECR site dropped. Stored as `repd` in `connections.json`.
- Map: `repd` layer; popups for REPD sites and for OSM plants/generators without a TEC match infer the likely substation (nearest OSM substation at a voltage suited to MW, labelled as inferred, dashed line).
- System Status: one row per connection register (records, build date).
- ENWL: no-feed notice in the outages panel, DNO popup and Analyst context; removed from the Worker. **Redeploy the Worker** (optional; only removes the ENWL attempt).

## 3.5.0 - 2026-11-12 - Phase 4: scenario library and impact model; energy flows; analyst questions
- `content/scenarios.ts`: 28 generic scenarios with `model`, `rationale`, `sources`, `customersBasis`; replaces the old built-in list (the vendor-named and site-specific ones are gone).
- `content/assumptions.ts`: every model value with source or reasoning (VoLL, average demand per customer, GB customers, SQSS loss limit, LFDD scaling, ESRS, ESEC rota block, gas CV) and reference events.
- `services/impactModel.ts`: deterministic profiles (instant, storm, restoration, rota, none, growth); hourly/6-hourly/daily steps; cost = energy not supplied × VoLL. Growth cost no longer invented.
- `services/flows.ts`, `components/EnergyFlowsPanel.tsx`: electricity (Elexon FUELINST, signed) and gas (National Gas latest flows by entry point, via Worker) by route; animated map layer.
- Worker `/gas` now uses National Gas `latest-gas-flows-download` (entry points, terminals, exports). **Redeploy the Worker.** Cache key bumped to v3.
- Fix: interconnector exports were zero (generation/outturn/current clamps exports).
- Chat: suggested questions; Analyst context includes gas routes and each scenario's model, rationale and sources.

## 3.4.0 - 2026-11-12 - Phase 3 (part 2): who connects where
- `scripts/build-connections.mjs` builds `data/connections.json` on each publish from the NESO TEC and Embedded Registers and the openly licensed DNO Embedded Capacity Registers (NPg; SPEN and UKPN when `SPEN_API_KEY` / `UKPN_API_KEY` GitHub secrets are set). Sites under 1 MW and all personal fields (customer names, MPANs, addresses) are dropped.
- Map: ECR site layer (fuel colour, MW size, connected vs accepted); site popup with Primary/BSP/GSP chain and route drawn to matched substations; substation popup lists connected MW by fuel, top sites and queue; power station popup shows TEC connection site.
- `services/connections.ts`: loading, name normalisation and matching (labelled as name-matched in every popup).
- NGED and ENWL ECRs excluded ("Shared" licences).

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
