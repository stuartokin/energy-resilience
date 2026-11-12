# Energy Sector Resilience & Risk

A live picture of the GB energy system - infrastructure, power cuts, generator outages, flows and warnings - built only from public open data, with "what if" disruption scenarios on top.

**Live site:** https://stuartokin.github.io/energy-resilience/ · **Version:** see [CHANGELOG.md](CHANGELOG.md)

*A personal project by Stuart Okin, Director of Cyber Regulation and Emerging Technologies, Ofgem. Not an official product of Ofgem or any other organisation. Live data comes directly from the publishers listed below. AI features are optional, use each visitor's own key, and are labelled as unverified. Scenario impacts are modelled illustrations, not forecasts.*

## How this works, in plain English

- **What you are looking at.** A map of GB energy infrastructure with live layers: power cuts from five DNOs, power station and interconnector outages, interconnector flows, gas system, grid frequency and demand, regional carbon intensity, and weather and flood warnings.
- **Where the data comes from.** Directly from the organisations that publish it (Elexon, NESO, the DNOs, National Gas, Met Office, Environment Agency, OpenStreetMap). Nothing is typed in by hand. Every source is listed in the app under **Help → About & sources** and in the table below.
- **How honesty is kept.** The app never invents a figure. If a feed fails, it shows the last real value marked "est." and the System Status says which feed failed. Modelled or estimated figures show their reasoning or source next to them.
- **What costs money.** Nothing. The map, data and hosting are free. AI features use each visitor's own free Gemini key, stored only in their browser.
- **What it cannot tell you.** Power-cut coverage excludes Electricity North West (restricted licence) and Northern Ireland (no open feed). OpenStreetMap is volunteer-mapped, so infrastructure coverage is very good but not complete. Scenario results are illustrations.

## How it fits together

| Path | What it is |
|---|---|
| `index.html`, `index.tsx`, `App.tsx` | The app (React + TypeScript, built with Vite). `App.tsx` holds the layout, panels and state. |
| `components/` | Map (`MapVisualization.tsx`, MapLibre GL), panels, modals, help (`HelpModal.tsx`), live systems panel, AI key box. |
| `components/DraggablePanel.tsx` | Every floating panel: move (mouse/touch), resize, A−/A+, saved layout; becomes a bottom sheet on phones. |
| `components/layout.tsx` | Screen modes (desktop / tablet / phone), saved layout, global text size. |
| `components/icons.ts` | The icon set, line colours by voltage, and the legend definitions. |
| `scripts/energy-tiles.yml` | Planetiler schema: which OpenStreetMap power and gas features go into the weekly map tiles (`tiles/energy.pmtiles`), and from which zoom level. |
| `index.css`, `tailwind.config.js`, `postcss.config.js` | Styling (Tailwind, built at publish time). |
| `services/geminiService.ts` | Live data fetching (Elexon, NESO, DNOs, REMIT), the OpenStreetMap snapshot loader, and all AI (Gemini) features. |
| `services/liveSystems.ts` | Interconnector flows, regional carbon, flood warnings, gas, weather warnings, NESO system notices. |
| `services/health.ts` | Records whether each data source really answered; drives System Status. |
| `services/aiKey.ts` | The visitor's own Gemini key (browser only). |
| `content/changelog.ts` | **What's new** in the app. Mirror of `CHANGELOG.md`. |
| `content/sources.ts` | **Every data source**: what it's used for, licence, refresh rate. Shown in Help. |
| `constants.ts` | Version number, asset types, built-in assets and scenarios. |
| `config.ts` | Site settings - the Cloudflare Worker address. |
| `worker/outages-worker.js` | The Cloudflare Worker: collects NGED, SSEN, SPEN power cuts, National Gas and Met Office data (sources a web page can't read directly). Runs on Cloudflare, not GitHub. |
| `scripts/build-osm-snapshot.mjs` | Run by GitHub Actions on each publish and weekly. Builds `data/osm-uk.json` (OpenStreetMap infrastructure) and calls the two scripts below. |
| `scripts/build-dno-areas.mjs`, `scripts/dno-geometry.mjs` | Download NESO's DNO boundaries, convert from British National Grid, simplify → `data/dno-areas.json`. |
| `scripts/build-bmu-locations.mjs` | Power station unit locations → `data/bmu-locations.json` (places REMIT outages on the map). |
| `scripts/build-connections.mjs` | Which generators and batteries connect to which substation → `data/connections.json` (NESO TEC/Embedded Registers + DNO Embedded Capacity Registers), plus the government planning database (REPD) for areas no register covers. Where no connection is published, the map infers the likely substation from OpenStreetMap and labels it as inferred. |
| `services/connections.ts` | Reads `connections.json` and matches register entries to map substations by name. |
| `content/scenarios.ts` | **The scenario library.** Each scenario has a model, the reasoning for its numbers and its sources. Copy one to add a new scenario. |
| `content/assumptions.ts` | **Every value the impact model uses**, with source or reasoning, plus reference events. Shown in Help → Scenario model. |
| `services/impactModel.ts` | Turns a scenario into customers off supply over time, energy not supplied and cost (VoLL). No AI, no random numbers. |
| `services/flows.ts`, `components/EnergyFlowsPanel.tsx` | Electricity and gas flowing into and out of GB, by route, on one GW scale; the map arrows. |
| `.github/workflows/deploy.yml` | Builds and publishes the site on every upload to `main`, and every Monday. |
| `CHANGELOG.md` | Version history. |
| `CLAUDE.md` | Rules for AI agents working on this repo (honesty, sources, style). |
| `ATTRIBUTION.md` | Data licences and required credits. |

### How the pieces connect

```
 Visitor's browser ──► GitHub Pages (this app)
        │                  ├─ tiles/energy.pmtiles ◄── built weekly by GitHub Actions (Planetiler + OpenStreetMap UK extract)
        │                  └─ data/*.json  ◄── built on each publish (OpenStreetMap snapshot, NESO boundaries + TEC register,
        │                                      DNO capacity registers, Power Station Dictionary)
        ├──► Elexon, NESO, UKPN, Northern Powergrid, Environment Agency   (read directly, every 1-5 min)
        ├──► Cloudflare Worker ──► NGED, SSEN, SPEN, National Gas, Met Office   (cached 2 min)
        └──► Google Gemini (only if the visitor adds their own key)
```

## Updating the app

**Normal updates (code or content):** upload changed files to `main` (Add file → Upload files). GitHub Actions rebuilds and publishes in a few minutes - watch the **Actions** tab for the green tick.

**Every release:**
1. Bump `APP_VERSION` in `constants.ts`.
2. Add an entry at the **top** of `content/changelog.ts` and `CHANGELOG.md`.
3. If you added a data source, add it to `content/sources.ts`, this README's source table and `ATTRIBUTION.md`.

**Version numbers:** MAJOR.MINOR.PATCH - major = big change in what the app is; minor = new features or data sources; patch = fixes.

**When `worker/outages-worker.js` changes:** open it on GitHub → **Copy raw file** → Cloudflare → your Worker → **Edit code** → select all, paste → **Deploy**. Secrets (`SPEN_API_KEY`) are kept.

**Check it's healthy:** open the site → click the green dot by "UK" → System Status shows each source and when it last answered.

## Turning on the AI features (each visitor uses their own free key)

1. Click **AI: Off** in the top bar.
2. Click **Google AI Studio → Get API key**, sign in, then **Create API key**.
3. Paste the key and click **Save**.

The key stays in that browser and is sent only to Google. Click **Remove** to delete it.

## One-off setup (already done for this repo)

<details>
<summary>Publishing on GitHub Pages</summary>

1. Create `.github/workflows/deploy.yml` (contents below).
2. **Settings → Pages → Source: GitHub Actions.**
3. Wait for the green tick on **Actions**. The site is at `https://stuartokin.github.io/energy-resilience/`.
4. Optional, for more connection data: add free API keys as **Settings → Secrets and variables → Actions → New repository secret**: `SPEN_API_KEY` (the same key the Worker uses) and `UKPN_API_KEY` (free account at ukpowernetworks.opendatasoft.com → profile → API keys). They are only used while building and never appear on the site.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: '17 3 * * 1'   # every Monday 03:17 UTC: refresh the OpenStreetMap snapshot

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install

      # ---- Energy map tiles: every OSM power and gas asset in the UK (rebuilt once a week) ----
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - name: Week number
        id: week
        run: echo "week=$(date -u +%G-%V)" >> "$GITHUB_OUTPUT"
      - name: Reuse this week's energy tiles if already built
        id: tiles
        uses: actions/cache@v4
        with:
          path: public/tiles
          key: energy-tiles-${{ steps.week.outputs.week }}-${{ hashFiles('scripts/energy-tiles.yml') }}
      - name: Build energy tiles from OpenStreetMap
        if: steps.tiles.outputs.cache-hit != 'true'
        continue-on-error: true
        timeout-minutes: 60
        run: |
          curl -sSL -o planetiler.jar https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar
          java -Xmx12g -jar planetiler.jar generate-custom --schema=scripts/energy-tiles.yml --output=energy.pmtiles --download --force
          # Only publish (and cache) the tiles if the build succeeded
          mkdir -p public/tiles && mv energy.pmtiles public/tiles/ && ls -lh public/tiles

      - name: Build OpenStreetMap snapshot and connection registers
        run: node scripts/build-osm-snapshot.mjs
        continue-on-error: true
        env:
          # Optional free keys for two DNO connection registers (skipped if not set). Never shown on the site.
          SPEN_API_KEY: ${{ secrets.SPEN_API_KEY }}
          UKPN_API_KEY: ${{ secrets.UKPN_API_KEY }}
        timeout-minutes: 20
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
</details>

<details>
<summary>The Cloudflare Worker (power cuts from NGED, SSEN, SPEN; gas; Met Office)</summary>

1. Sign up free at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Compute → Workers & Pages → Create → Start with Hello World.** Name it `energy-outages`. Leave **Protect with Cloudflare Access** off. **Deploy**.
3. **Edit code** → delete everything → paste all of `worker/outages-worker.js` → **Deploy**.
4. Check `https://energy-outages.<you>.workers.dev/outages` shows data.
5. Put the address in `config.ts` (`OUTAGE_WORKER_URL`).
6. SP Energy Networks: create a free account and API key at spenergynetworks.opendatasoft.com, then Worker → **Settings → Variables and Secrets → Add → Secret** named `SPEN_API_KEY` → **Deploy**.
7. **Whenever `worker/outages-worker.js` changes** (the changelog says so), repeat step 3: Edit code → paste the new file → Deploy.

Electricity North West's outage data is classified "Shared" (public bodies only, restricted licence), so it is deliberately not used. The Worker caches for 2 minutes; Cloudflare's free plan allows 100,000 requests a day.
</details>

<details>
<summary>Running it on your own computer</summary>

Needs [Node.js](https://nodejs.org) 20+. Run `npm install`, then `npm run dev`, then open http://localhost:3000.
</details>

## Data sources

| Source | Used for | Updates | Via |
|---|---|---|---|
| [Elexon Insights (BMRS)](https://bmrs.elexon.co.uk/api-documentation) | Frequency, demand, history, generation by fuel, interconnector flows (FUELINST) | 1-5 min | Direct |
| [Elexon REMIT](https://bmrs.elexon.co.uk/remit) | Power station and interconnector outages | 5 min | Direct |
| [Elexon system warnings](https://bmrs.elexon.co.uk/system-warnings) | NESO margin and demand-control notices | 5 min | Direct |
| [NESO Carbon Intensity](https://carbonintensity.org.uk) | GB and regional mix, carbon intensity | 5 min | Direct |
| [NESO DNO licence areas](https://www.neso.energy/data-portal/gis-boundaries-gb-dno-license-areas) | DNO boundaries | Each publish | Build |
| [UK Power Networks](https://ukpowernetworks.opendatasoft.com/explore/dataset/ukpn-live-faults/) | Power cuts | 1 min | Direct |
| [Northern Powergrid](https://northernpowergrid.opendatasoft.com/explore/dataset/live-power-cuts-data/) | Power cuts | 1 min | Direct |
| [NGED](https://connecteddata.nationalgrid.co.uk/dataset/live-power-cuts) | Power cuts | 2 min | Worker |
| [SSEN](https://data.ssen.co.uk/@ssen-distribution/realtime_outage_dataset) | Power cuts | 2 min | Worker |
| [SP Energy Networks](https://spenergynetworks.opendatasoft.com/explore/dataset/national-energy-outage-data/) | Power cuts | 2 min | Worker (key) |
| [National Gas](https://data.nationalgas.com) | Gas demand, supply, linepack, flows by entry/export point | 5 min | Worker |
| [Met Office](https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings) | Weather warnings | 5 min | Worker |
| [Environment Agency](https://environment.data.gov.uk/flood-monitoring/doc/reference) | Flood warnings (England) | 5 min | Direct |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Infrastructure, place search | Weekly + on zoom | Build / direct |
| [OSUKED Power Station Dictionary](https://github.com/OSUKED/Power-Station-Dictionary) | Power station unit locations | Each publish | Build |
| [NESO TEC / Embedded Register](https://www.neso.energy/data-portal/transmission-entry-capacity-tec-register) | Transmission connection site of large generators and batteries | Each publish | Build |
| [DESNZ Renewable Energy Planning Database](https://www.gov.uk/government/publications/renewable-energy-planning-database-quarterly-extract) | Renewable and storage sites (1 MW+) where no network register covers them | Each publish | Build |
| DNO Embedded Capacity Registers: [NPg](https://northernpowergrid.opendatasoft.com/explore/dataset/embedded-capacity-register/), [SPEN](https://spenergynetworks.opendatasoft.com/explore/dataset/embedded-capacity-register/) (key), [UKPN](https://ukpowernetworks.opendatasoft.com/explore/dataset/ukpn-embedded-capacity-register/) (key) | Generators/batteries ≥1 MW and their Primary, BSP and GSP | Each publish | Build |
| [Esri World Dark Gray Canvas](https://www.arcgis.com/home/item.html?id=358ec1e175ea41c3bf5c68f0da11ae2b) | Map background | Live | Direct |
| [RainViewer](https://www.rainviewer.com/api.html) | Weather radar | Live | Direct |
| [Google Gemini](https://ai.google.dev) | AI features (visitor's own key) | On request | Direct |

Licences and credits: [ATTRIBUTION.md](ATTRIBUTION.md).

## Roadmap

1. ~~Phase 1 - real data only, working history charts, help and versioning~~ (v3.1.0)
2. ~~Phase 2 - movable, resizable, text-size adjustable panels; layouts for every screen; new icon set~~ (v3.2.0)
3. ~~Phase 3 part 1 - MapLibre map with weekly tiles of every UK energy asset; substation connections~~ (v3.3.0). ~~Part 2 - which generators connect to which substation~~ (v3.4.0)
4. ~~Phase 4 - a curated library of realistic risk scenarios in every category, with a transparent, sourced impact model~~ (v3.5.0). Also live energy flows and built-in analyst questions
5. Phase 5 - weekly research agents that propose new scenarios and sources for review
