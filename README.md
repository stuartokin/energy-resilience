# Energy Sector Resilience & Risk

An interactive map of GB energy infrastructure with live grid data and "what if" disruption scenarios: storms, cyber attacks, asset failures, supply-chain problems and demand growth.

By Stuart Okin, Director of Cyber Regulation and Emerging Technologies, Ofgem. A personal project, not an Ofgem product.

## What works without any setup

- **Map** of generation, transmission, distribution and interconnectors (OpenStreetMap data, Esri dark grey basemap)
- **Live grid data**: frequency and demand from Elexon, generation mix and carbon intensity from NESO
- **Live power cuts** from UK Power Networks (London, South East, East) and Northern Powergrid (North East, Yorkshire), from their open data
- **DNO licence areas** with their real boundaries (NESO open data)
- **Power station and interconnector outages** live from Elexon REMIT notices (amber diamonds = unplanned, grey = planned; size = MW unavailable)
- **Live Systems panel**: interconnector flows, generator outages, gas system (demand, supply, linepack), Met Office weather warnings and Environment Agency flood warnings, refreshed every 5 minutes
- **Interconnector flows** on the map at each GB landing point (green = importing, orange = exporting)
- **Regional carbon intensity and generation mix** in each DNO area's popup (NESO)
- **Flood warnings** (England) and **weather warnings** as map layers
- **Weather radar** (RainViewer)
- **Built-in scenarios** with a day-by-day timeline of customers off supply, cost and restoration
- **Place search** (OpenStreetMap)

No accounts, no API keys, no cost.

## Turning on the AI features (each visitor uses their own free key)

The AI analyst, generated scenarios, live outage search, supply-chain analysis and reports use Google Gemini. Each visitor adds their own key, so the site owner pays nothing.

1. Click **AI: Off** in the top bar.
2. Click the link to **Google AI Studio → Get API key**, sign in, then click **Create API key**.
3. Paste the key and click **Save**.

The key stays in that visitor's browser and is sent only to Google. Click **Remove** in the same box to delete it. Google's free tier covers normal use; video reports need a paid key.

## Publishing on GitHub Pages (one-off setup)

1. In the repo, create the file `.github/workflows/deploy.yml` with the contents below and commit it.
2. Go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab and wait for the green tick (about a minute).
4. The site is live at `https://stuartokin.github.io/energy-resilience/`.

After that, every upload to `main` republishes the site automatically. It also rebuilds every Monday to refresh the infrastructure snapshot (see below).

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
      - name: Build OpenStreetMap infrastructure snapshot
        run: node scripts/build-osm-snapshot.mjs
        continue-on-error: true
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

Note: GitHub Pages on a **private** repo needs a paid GitHub plan. On a free plan, make the repo public first.

## Live power cuts from every DNO (optional, free)

UK Power Networks and Northern Powergrid work straight away. The other DNOs' feeds can't be read directly by a web page, so a small free **Cloudflare Worker** collects them and passes them to the site.

| DNO | Needs |
|---|---|
| NGED, SSEN | Just the Worker |
| SP Energy Networks, Electricity North West | The Worker + a free API key from each DNO's open-data portal |

**Set up the Worker (about 10 minutes, once):**

1. Sign up free at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. Go to **Workers & Pages → Create → Create Worker** (the "Hello World" starter). Name it `energy-outages` and click **Deploy**.
3. Click **Edit code**, delete everything, paste in the whole of `worker/outages-worker.js`, then click **Deploy**.
4. Copy the Worker's address, e.g. `https://energy-outages.yourname.workers.dev`. Open it in a browser and add `/outages` to check you see a list.
5. In this repo, put that address in `config.ts` (`OUTAGE_WORKER_URL`) and upload it.

**Add SPEN and ENWL (optional):**

1. Create free accounts at [SP Energy Networks open data](https://spenergynetworks.opendatasoft.com) and [Electricity North West open data](https://electricitynorthwest.opendatasoft.com).
2. On each, go to your account → **API keys** → create a key. Request access to the outage dataset if asked.
3. In Cloudflare, open the Worker → **Settings → Variables and Secrets → Add**, type **Secret**, name `SPEN_API_KEY` (and `ENWL_API_KEY`), paste the key, **Deploy**.

The Worker also serves `/gas` (National Gas) and `/warnings` (Met Office), which browsers can't read directly. Whenever `worker/outages-worker.js` changes, paste the new version into Cloudflare (**Edit code** → paste → **Deploy**).

The keys stay in Cloudflare and never appear in this repo or the website. Check ENWL's licence terms before showing its data publicly. The Worker caches results for 2 minutes, so the DNOs are asked at most once every 2 minutes however many people visit. Cloudflare's free plan allows 100,000 requests a day.

## Running it on your own computer (optional)

Needs [Node.js](https://nodejs.org) 20 or later.

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Data sources

| Source | Used for | Key needed? |
|---|---|---|
| [Elexon Insights (BMRS)](https://bmrs.elexon.co.uk/api-documentation) | Grid frequency, rolling demand | No |
| [NESO Carbon Intensity](https://carbonintensity.org.uk) | Generation mix, carbon intensity | No |
| [OpenStreetMap](https://www.openstreetmap.org) / Overpass / Nominatim | Infrastructure, place search | No |
| [UK Power Networks open data](https://ukpowernetworks.opendatasoft.com/explore/dataset/ukpn-live-faults/) | Live power cuts (UKPN areas) | No |
| [Northern Powergrid open data](https://northernpowergrid.opendatasoft.com/explore/dataset/live-power-cuts-data/) | Live power cuts (NPg areas) | No |
| [Elexon REMIT](https://bmrs.elexon.co.uk/remit) | Power station / interconnector outages | No |
| [OSUKED Power Station Dictionary](https://github.com/OSUKED/Power-Station-Dictionary) | Where each power station unit is (MIT licence) | No |
| [NESO DNO licence areas](https://www.neso.energy/data-portal/gis-boundaries-gb-dno-license-areas) | DNO boundaries | No |
| [Elexon generation by fuel](https://bmrs.elexon.co.uk/generation-by-fuel-type) | Interconnector flows | No |
| [NESO Carbon Intensity (regional)](https://carbonintensity.org.uk) | Carbon intensity and mix by DNO area | No |
| [Environment Agency flood monitoring](https://environment.data.gov.uk/flood-monitoring/doc/reference) | Flood warnings (England only) | No |
| [National Gas Data Portal](https://data.nationalgas.com) | Gas demand, supply, linepack (via Worker) | No |
| [Met Office warnings](https://www.metoffice.gov.uk/weather/warnings-and-advice/uk-warnings) | Weather warnings (via Worker) | No |
| [Esri World Dark Gray Canvas](https://www.arcgis.com/home/item.html?id=358ec1e175ea41c3bf5c68f0da11ae2b) | Map tiles | No |
| [RainViewer](https://www.rainviewer.com/api.html) | Weather radar | No |
| [Google Gemini](https://ai.google.dev) | AI features | Visitor's own key |

## Infrastructure snapshot

Querying OpenStreetMap for the whole of GB is slow and the free public servers are often busy. So each time the site is published (and every Monday), GitHub Actions runs `scripts/build-osm-snapshot.mjs`, which downloads power stations, high-voltage lines, interconnectors and subsea pipelines once and saves them as `data/osm-uk.json` alongside the site. The same step downloads NESO's DNO licence-area boundaries, converts them from British National Grid to latitude/longitude, simplifies them and saves `data/dno-areas.json`. It also saves `data/bmu-locations.json`, a lookup of where each power station unit is, so Elexon's outage notices (which have no map coordinates) can be placed. Units not in the lookup, usually very new stations, are left off the map. Visitors load that file instantly. If the snapshot can't be built, the site still works and tries OpenStreetMap live instead.

Power cuts shown are real: from UK Power Networks' and Northern Powergrid's live feeds, plus (if you add a Gemini key) incidents found by AI web search, which are labelled "unverified". Areas whose DNO feed isn't connected (see the system status panel) may still have power cuts.

AI features use Google Gemini with Google Search. Their output is labelled in the app as unverified web-search results; the asset summary deliberately does not speculate about specific sites' suppliers or control systems.

Scenario timelines and impacts are illustrative models, not forecasts. Where a live feed is unavailable, the app falls back to estimated values and records that in the system log.
