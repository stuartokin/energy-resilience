# Energy Sector Resilience & Risk: rules for Claude (and any AI agent)

A public, personal project by Stuart Okin: a live picture of the GB energy system from public open data, with "what if" scenarios. It carries his name and Ofgem title, so accuracy and restraint matter more than features.

## Honesty rules (non-negotiable)
- **Never invent a figure.** No `Math.random()` or hard-coded numbers presented as data. Every number comes from a live source, a build-time dataset, or a documented assumption with its source.
- **If data is missing, say so.** Show "unavailable", or the last real value marked "est." - never a plausible-looking substitute.
- **Every estimate or modelled value carries its reasoning or source** next to it in the UI (and in the scenario parameter files once built).
- **AI output is labelled** as unverified web search. AI never supplies the numbers in scenario impact models.
- **No site-specific attack detail.** Scenarios are system-level and generic (e.g. "single OT vendor common-mode compromise"), never naming a vendor against mapped sites, never speculating about a specific site's suppliers, controls or weaknesses.
- **Scenarios** live in `content/scenarios.ts`. Each needs a `model`, a `rationale` (why the numbers; say "assumption" where it is one), `sources` ("Title — URL") and `customersBasis`. Model values live in `content/assumptions.ts` with a source or stated reasoning. Real events are reference points, not targets.
- **AI scenario proposals** never carry numbers or coordinates. A proposal runs only after the user picks a `MODEL_PATTERNS` entry, whose sourced library scenario supplies every number (`adoptProposal`). Don't reintroduce automatic AI scenario generation.
- **Scenario map footprints** (`FOOTPRINTS` in `content/scenarios.ts`, drawn by `services/footprint.ts`) are illustrative: national, regions, `placeable`, or a point based on a real past event, never a site picked as a target. `EVENTS` captions only state what the cited source says. Every shaded area must stay labelled as modelled and illustrative. DNO line data is used only from datasets under an open licence; skip anything "Shared".
- Don't use restricted data (e.g. ENWL "Shared" data) or anything not openly licensed for public display.

- **System-level only.** Never rank individual sites by how much their loss would hurt (aggregation risk). Concentration views stay at route, link, fuel and weather level.
- **History** (Worker → Workers KV) stores public, aggregate data only; power cuts as rounded location, customers and times.

## Start here in a new conversation
Read `docs/HANDOVER.md`: purpose, architecture, decisions, known gaps, release checklist and roadmap. Update it with every release.

## Documentation is part of every change
- Bump `APP_VERSION` in `constants.ts`.
- Add an entry at the top of `content/changelog.ts` **and** `CHANGELOG.md`.
- New data source → `content/sources.ts`, the README source table and `ATTRIBUTION.md`.
- New file or folder → the README "How it fits together" table.

## Delivery
Stuart uploads changes through GitHub's web upload. Deliver only changed files, as a zip that keeps the repo's folder structure. He edits `.github/` files himself.

## Style
British English. Plain, short sentences. Accessible contrast, labels on anything interactive, works on a phone (390 px wide).
