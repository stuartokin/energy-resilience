# Energy Sector Resilience & Risk

An interactive map of GB energy infrastructure with live grid data and "what if" disruption scenarios: storms, cyber attacks, asset failures, supply-chain problems and demand growth.

By Stuart Okin, Director of Cyber Regulation and Emerging Technologies, Ofgem. A personal project, not an Ofgem product.

## What works without any setup

- **Map** of generation, transmission, distribution and interconnectors (OpenStreetMap data, CARTO dark tiles)
- **Live grid data**: frequency and demand from Elexon, generation mix and carbon intensity from NESO
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

After that, every upload to `main` republishes the site automatically.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

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
| [CARTO basemaps](https://carto.com/basemaps) | Map tiles | No |
| [RainViewer](https://www.rainviewer.com/api.html) | Weather radar | No |
| [Google Gemini](https://ai.google.dev) | AI features | Visitor's own key |

Scenario timelines and impacts are illustrative models, not forecasts. Where a live feed is unavailable, the app falls back to estimated values and records that in the system log.
