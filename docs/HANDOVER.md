# Energy Resilience: handover for a new conversation

Read this first if you are picking up work on this app in a new conversation (Claude, or anyone). It explains what the app is, the rules, how it is built, why key decisions were made, what is unverified, and what comes next. Keep it up to date in every release (see "Release checklist").

- **Repo:** `stuartokin/energy-resilience` (public). Site: GitHub Pages, `https://stuartokin.github.io/energy-resilience/`.
- **Owner:** Stuart Okin (personal project; it carries his name and Ofgem title, so accuracy and restraint matter more than features). The original `stuartokin/Energy-risk` repo (Google AI Studio) is left untouched.
- **Version at the time of writing:** see `APP_VERSION` in `constants.ts` and the top of `CHANGELOG.md`.
- **Short rules file for AI agents:** `CLAUDE.md`. Interactive version of this document: the cube icon in the app's top bar ("How it's built"), driven by `content/architecture.ts`.

## 1. What the app is for

1. **Live:** see how the GB energy system is running now and over time (demand, frequency, generation mix, interconnectors, gas, power cuts, warnings), with charts and printable reports.
2. **Scenarios:** run one or more "what if" risks together and see the modelled impact over time on the map and in charts, then produce a report or video briefing.

It must work on phones (390 px), Samsung Fold, tablets, laptops and large screens. No running costs: free services only, and each visitor uses their own free Gemini key for AI features.

## 2. Non-negotiable rules

- **Never invent a figure.** Every number comes from a live source, a build-time dataset, or a documented assumption with its reasoning (`content/assumptions.ts`). If data is missing, show "–" or "unavailable".
- **AI never supplies scenario numbers.** AI output (analyst, report summaries, scenario proposals, video script) is labelled as unverified. AI proposals carry no numbers or coordinates; to run, the user picks a `MODEL_PATTERNS` entry and the sourced library scenario supplies the numbers (`adoptProposal`). No automatic AI scenario generation.
- **Generic scenarios.** No named equipment supplier; no real site as a target. Real past events (Storm Arwen, 9 August 2019, North Hyde 2025, Lancaster/Storm Desmond 2015) are reference points only. Footprints are illustrative and labelled "modelled and illustrative".
- **System-level only.** No ranking of individual sites by criticality (aggregation risk: a public "most critical substations" list is a targeting aid). The Concentration panel shows routes, links, fuels and weather dependence only.
- **Licences.** Only openly licensed data. Electricity North West data and NGED's Embedded Capacity Register are "Shared" (restricted) and excluded. Network-operator line data is used only from datasets under CC BY, OGL, ODbL or an operator open-data licence.
- **No personal data.** Connection registers drop customer names, MPANs and addresses. History stores power cuts as rounded location, customer count and times only.
- **Secrets never in the repo.** `SPEN_API_KEY` (Cloudflare Worker secret and GitHub secret), `UKPN_API_KEY` (GitHub secret). Visitor Gemini keys stay in their browser (`services/aiKey.ts`).
- **Style.** British English, plain short sentences, accessible contrast and labels.

## 3. How Stuart works with it

- He uploads changed files through GitHub's web upload. **Deliver only changed files, as a zip that keeps the folder structure.** He edits `.github/workflows/deploy.yml` himself, so give that file separately when it changes, and tell him which files to delete in GitHub when files are removed.
- When `worker/outages-worker.js` changes, he pastes it into the Cloudflare dashboard (Worker `energy-outages` → Edit code → Deploy).
- Byline in documents Claude writes for him: "Stuart Okin, Director of Cyber Regulation and Emerging Technologies, Ofgem". In the app, the report byline starts empty and is remembered per browser (other people use the site).

## 4. Architecture

```
Public sources ──► Collectors ─────────────► Stored data ───────────────► Browser app ─────► What you see
Elexon, NESO,      Cloudflare Worker         GitHub Pages static files     services/*         Map (MapLibre)
operators, gas,    (live feeds, history      (tiles, snapshot, registers,  impact model       Windows (panels)
Met Office, EA,    snapshots every 15 min)   GSP areas, operator lines)    footprints         Reports, video
OSM, DESNZ         GitHub Actions (weekly    Workers KV (history)          views              Presentation mode
                   builds, GDAL, Planetiler) Gemini (visitor's own key)
```

### Front end
React 19, Vite 6, TypeScript, Tailwind 3.4, MapLibre GL 4.7 with PMTiles, Recharts. Large libraries are split into their own chunks (`vite.config.ts`).

### Key files
| Area | Files |
|---|---|
| Shell and state | `App.tsx` (state, data loading, window definitions, playback, views, presentation, tour steps) |
| Window system | `components/shell/windows.tsx` (docked / floating / minimised / closed; side panel; tool rail; phone sheet; saved in localStorage `energy_resilience_windows_v1`; `snapshot`/`restore` for views) |
| Panels | `components/panels/LivePanels.tsx` (Overview, Electricity, Outages), `ScenarioPanels.tsx` (Library with AI proposals, Results, Model), `HistoryPanel.tsx`, `ConcentrationPanel.tsx`, `components/EnergyFlowsPanel.tsx` |
| Map | `components/MapVisualization.tsx`, `components/icons.ts` |
| Scenario model | `content/scenarios.ts` (library, `FOOTPRINTS`, `EVENTS`, `MODEL_PATTERNS`, `adoptProposal`), `content/assumptions.ts`, `services/impactModel.ts`, `services/footprint.ts` |
| Data | `services/geminiService.ts` (live feeds, OSM, AI, System Status rows), `services/liveSystems.ts`, `services/flows.ts`, `services/connections.ts`, `services/history.ts`, `services/health.ts` |
| Views | `services/views.ts` (save to file, named views in localStorage `energy_resilience_views_v1`, share link `#view=`) |
| Docs in the app | `components/HelpModal.tsx`, `components/HowItsBuilt.tsx` + `content/architecture.ts`, `components/TourGuide.tsx`, `content/changelog.ts`, `content/sources.ts` |
| Reports | `components/ReportBuilder.tsx` (print portal, A4), `components/ReportModal.tsx` (video briefing) |
| Worker | `worker/outages-worker.js` (`/outages`, `/gas`, `/warnings`, `/history`, `/history/day?d=`; Cron Trigger every 15 min writes history to KV binding `LAKE`) |
| Build scripts | `scripts/build-osm-snapshot.mjs` (calls `build-dno-areas.mjs`, `build-bmu-locations.mjs`, `build-connections.mjs`), `scripts/build-network-extras.mjs` (GSP areas, operator lines; needs GDAL), `scripts/energy-tiles.yml` (Planetiler) |
| Workflow | `.github/workflows/deploy.yml` (on push, weekly Monday 03:17 UTC, manual) |

### Built data (in `public/`, produced by Actions; not in the repo)
`tiles/energy.pmtiles` (OSM energy features, weekly, cached by week), `network/dno-lines.pmtiles` + `data/dno-lines-sources.json` (operator 33 kV+ lines, weekly), `data/osm-uk.json`, `data/dno-areas.json`, `data/gsp-areas.json`, `data/connections.json`, `data/bmu-locations.json`.

### Map layers (bottom to top)
Esri dark basemap → radar → DNO areas → data-coverage hatch → OSM infrastructure tiles → operator lines → connection-register sites → place labels → scenario footprint (`impact-red`, `impact-red-line`, `impact-black`) → energy flows → HTML markers (power cuts, generator outages, warnings, flow labels).

## 5. The scenario engine

- **Library:** 29 scenarios in `content/scenarios.ts`, each with `model` (impact profile), `rationale`, `sources` ("Title — URL"), `customersBasis` (sourced / scaled / assumption), plus a map `footprint` and optional `events` (captions that only state what the cited source says).
- **Profiles** (`services/impactModel.ts`): instant, storm, restoration, rota, none, growth. Time steps of 1, 6 or 24 hours depending on the horizon. Each timeline starts with a lead-in of normal running (negative `hours`).
- **Cost** = energy not supplied × Value of Lost Load (£16,950/MWh, DECC 2013); energy not supplied = customers off × 0.31 kW (Ofgem typical domestic consumption) × hours. This is a floor.
- **Footprints** (`services/footprint.ts`): NESO Grid Supply Point areas (fallback: DNO areas). Each area = 30 million ÷ number of areas customers (labelled assumption `mapArea`); areas are ranked by pattern (spread, scatter, patches, rota) and the top share goes dark. Animation: red haze then black; restored areas fade back; a faint red pre-warning only while cuts are spreading.
- **Routes cut** (`resolveRoutes`): `largestGas`, `largestElec`, `norway`, `lng` resolved from live flows when the run starts. Fleet highlight for common-mode scenarios.
- **Playback:** about 22 s at 1x, with more time on steps where customers off changes or a caption appears. While a scenario runs, live power cuts, generator outages, data centres and coverage hatching are hidden, then restored on Clear.

## 6. History (data lake)

- The Worker's `scheduled()` handler runs every 15 minutes (Cron Trigger `*/15 * * * *`) and appends one column to `day:YYYY-MM-DD` in Workers KV (binding `LAKE`). An `index` key lists stored days.
- Contents: demand; frequency min/max/last and seconds outside 49.8–50.2 Hz; FUELINST by fuel including signed interconnectors; gas supply, demand, linepack and every entry point; power cuts per network (customers off, unplanned and planned counts) plus each cut (rounded location, customers, first and last seen); Met Office warnings; EA flood warning counts.
- Free-tier budget: about 100 KV writes a day (limit 1,000); records are small (roughly 100–300 kB a day).
- The History window (`components/panels/HistoryPanel.tsx`) reads days through `services/history.ts` and draws: power cuts by network, worst day with warnings, generation by type, imports by country, wind heatmap, frequency minutes outside limits, gas supply and linepack, concentration over time.

## 7. Decisions and why

| Decision | Why |
|---|---|
| Elexon FUELINST for interconnectors | `generation/outturn/current` clamps exports to zero |
| National Gas `latest-gas-flows-download` via the Worker | Gives entry points, terminals and exports; browsers can't read it (CORS) |
| Gas shown in GW at 39.5 MJ/m³ (1 mcm/d ≈ 457 MW) | One scale for gas and electricity; assumption labelled |
| ENWL excluded; North West hatched "no live data" | Its outage data and register are "Shared" (restricted) |
| GSP areas for footprints | Finer than DNO areas, NESO open licence, honest "equal share" assumption |
| AI only proposes scenarios | Keeps every number sourced; AI never invents impacts |
| OT supply-chain analysis removed | It had AI listing suppliers against energy companies |
| No site-level single-point-of-failure ranking | Aggregation risk; operators already plan to N-1 standards; OSM data too incomplete to be reliable |
| History in Workers KV, not R2 or git | Free without a payment method; small daily records; git repos slow down with large data |
| Each visitor brings their own Gemini key | No running costs for Stuart |

## 8. Known gaps and things not yet verified

- **Operator line datasets** (`build-network-extras.mjs lines`): discovered and licence-checked at build time; the first build log and `data/dno-lines-sources.json` show which were used and skipped. Not yet confirmed in production.
- **GSP areas build** depends on NESO's latest "GSP Regions" file (most recently `GSP Regions 20260209`). Check System Status → "Grid Supply Point areas".
- **History** needs the KV namespace, binding and Cron Trigger set up in Cloudflare (see the top of the Worker file). Nothing is collected until then.
- SPEN's live feed has no customer numbers. Northern Ireland has no open live power-cut feed connected. FUELINST excludes embedded solar.
- The "Ask AI for ideas" flow has been tested with saved proposals but not against a live Gemini key in this environment.
- OSM-inferred connections are labelled as inferred and may be wrong.

## 9. Release checklist

1. Bump `APP_VERSION` (`constants.ts`).
2. Add the release to `content/changelog.ts` and `CHANGELOG.md`.
3. New data source → `content/sources.ts`, README table, `ATTRIBUTION.md`, `content/architecture.ts`.
4. New file or folder → README "How it fits together", `content/architecture.ts`, this file's key files table.
5. Decisions, gaps or next steps changed → update sections 7–10 of this file.
6. `npx tsc --noEmit`, `npm run build`, and a browser check (desktop and phone width).
7. Deliver a zip of changed files with folder structure; `deploy.yml` separately if changed; list files to delete; say if the Worker must be re-pasted.

## 10. Roadmap and ideas

- **Phase 5:** weekly research agent (scheduled) that proposes new scenarios and sources for Stuart to review, using the proposal-and-pattern flow (never auto-publishing numbers).
- History charts that need weeks of data: storm restoration curves against Arwen, warning-to-peak lag, still-spell detector, LNG share through the winter, connection queue growth (monthly register snapshots).
- "Arwen on today's system": replay a scenario against a chosen day's actual mix and imports.
- Compare two scenarios on a split map; record a run as a video file directly from the map.
- Merge Scenario Manager into the Library; more data (Sheffield Solar PV_Live, NESO forecasts vs actual, Elexon system prices); "last updated" time on every figure.
- Automated tests in Actions (type check, build, a Playwright smoke test).
