# Iligan Climate+

A public, barangay-level dashboard tracking El Niño / heat and drought risk
across Iligan City's 44 barangays, organized on three pillars: Environmental
(what is happening), Social (who is affected), and Governance (what the city
is doing).

## Who we are

This is a City Government of Iligan initiative, from CDIIS — Center for
Digital Iligan, Innovation and Sustainability — via the Digital Creatives
Hub, in collaboration with DEVCON Iligan (Developers Connect Philippines,
Iligan Chapter), whose resources were used. The collaboration is confirmed
by CDIIS.

Because a city office's name is on this dashboard, every figure on it reads
as official, so the modelled-vs-authoritative distinction matters more, not
less: PAGASA remains the authoritative source for heat index and El Niño
advisories, this dashboard is a monitoring tool and never an advisory, and
data ownership stays with whichever office actually produces each dataset.
See `CLAUDE.md` for the full rules.

## Status: pre-alpha, open data only

- **Live site:** not deployed yet — this repository has no GitHub remote
  configured in the environment it was built in, so `.github/workflows/`
  has never actually run. Once it's pushed to GitHub and Pages is enabled
  (see "How to deploy"), this line will be replaced with the real URL.
- Of the 8 MVP indicators (see `CLAUDE.md`), only heat index is wired to a
  real source (Open-Meteo, supplementary — PAGASA iHeatMAP is authoritative).
  Rainfall, water level/availability, and fire incidents are unbuilt; all of
  Social and Governance are unbuilt. The dashboard shows all of these as
  "NO DATA / PENDING" with the office that owns each one.
- No live city-owned data is flowing yet — only public, citable reference
  data (barangay list, PSGC codes, PSA population figures, OSM reference
  points) plus the derived Open-Meteo heat index calculation.
- Any file suffixed `.sample.json` is placeholder data for development only.
  It must never be presented as real, and any view built on it must show a
  visible "SAMPLE — NOT REAL DATA" banner.

## What's here so far

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Non-negotiable rules for data handling, labeling, scope, and voice. Read this first. |
| `data/barangays.json` | Reference list of all 44 barangays: PSGC code, name, population (PSA 2024), coordinates. Fields we couldn't verify from a citable source are `null` — see "Known gaps" below. |
| `data/indicators/` | Where the fetch job will write per-indicator JSON. Empty for now. |
| `data/samples/` | Sample/fixture data for frontend development. Not real. |
| `schema/record.schema.json` | The JSON Schema every indicator record must satisfy. |
| `scripts/fetch/heat-index.js` | NWS/Rothfusz heat index formula + band classifier, with unit tests against published NWS values. |
| `scripts/fetch/fetch-heat-index.js` | One batched Open-Meteo call for all 44 reference points; writes `data/heat-index-latest.json`. Validates its own output (44 barangays, no null/NaN values) before writing — a bad run leaves the last good file untouched. |
| `src/` | Static frontend: single-page ESG dashboard (scorecard, hero card, 4 charts, ranked table). No map in the MVP — see CLAUDE.md's Phase 2 section. |
| `.github/workflows/fetch.yml` | Runs the fetch hourly (+ manual trigger) and commits the data file only if it changed. |
| `.github/workflows/pages.yml` | Deploys `src/` + `data/` to GitHub Pages on every push to `main`. |

## Known gaps (as of this scaffold)

- **Coordinates**: `data/barangay_reference_points.json` now carries an
  approximate reference point per barangay (OpenStreetMap admin_level=10
  centroids/label nodes, ODbL 1.0), used to sample the weather grid. These
  are points, not surveyed boundaries — see that file's `_meta` block for
  known limitations (Tambacan in particular is low-confidence). Real
  boundaries (needed for the phase 2 map) still require NAMRIA/PhilGIS/City
  CPDO data.
- **Population figures**: sourced from a citypopulation.de mirror of PSA
  2024 POPCEN data, cross-checked against an independent search (city total
  368,132; largest barangay Tubod 31,813 — both match). The official
  `psa.gov.ph` PSGC portal returned HTTP 403 to automated fetch at the time
  of writing, so these numbers are marked `status: reported` pending direct
  verification against PSA, not `verified`.

## How to run

1. Fetch live data: `node scripts/fetch/fetch-heat-index.js` — writes
   `data/heat-index-latest.json`. Requires nothing but internet access (no
   API key; Open-Meteo is a free public API).
2. Preview the dashboard locally. `src/index.html` fetches
   `data/heat-index-latest.json` as a **sibling** file (this matches how
   `.github/workflows/pages.yml` deploys it — `data/` staged next to
   `src/`'s contents, not one level above). To preview that same layout
   locally:
   ```
   mkdir -p _site && cp -r src/. _site/ && cp -r data _site/data
   npx --yes serve _site
   ```
   (or any other static file server pointed at `_site/`). `_site/` is
   git-ignored — it's a local preview convenience, not a repo artifact.
3. Run the heat index unit tests: `node --test scripts/fetch/heat-index.test.js`

## How to deploy

Target: GitHub Pages, zero running cost, no server, no database, no
dependency on a single person's account.

- **`.github/workflows/fetch.yml`** runs hourly (and on manual dispatch),
  regenerates `data/heat-index-latest.json`, and commits it to `main` only
  if it actually changed. It validates its own output first — fewer than 44
  barangays or any non-finite heat index value makes the run fail loudly
  and skip the commit, so a bad fetch never overwrites good data. Uses only
  the repo's built-in `GITHUB_TOKEN` (needs `contents: write` permission,
  already set in the workflow).
- **`.github/workflows/pages.yml`** deploys on every push to `main`. GitHub
  Pages' "deploy from a branch" source can only serve the repo root or
  `/docs`, not an arbitrary `/src` folder — so this workflow stages `src/`'s
  contents and `data/` as siblings into one build artifact and deploys that
  via `actions/upload-pages-artifact` + `actions/deploy-pages`, which puts
  the dashboard at the site's bare root URL.
- **One manual, one-time repo setting is required** before either workflow
  can deploy anything: in the GitHub repo's **Settings → Pages**, set
  **Source** to **"GitHub Actions"** (not "Deploy from a branch"). This
  can't be done from the command line without a token/`gh` login, so
  whoever has admin access on the repo needs to flip it once.
- Cloudflare Pages was the original zero-cost alternative under
  consideration; the workflows above are GitHub-Pages-specific, but the
  static output (`src/` + `data/`) would work unchanged behind any static
  host if the project ever needs to move.

## Data & accuracy

See `CLAUDE.md` for the full rules. In short: PAGASA is authoritative for
weather/heat data; everything else (including this project's own risk
calculations) is supplementary or derived and must be labeled as such;
unknown values are `null` in data and "NO DATA / PENDING" in the UI, never
guessed.

## Contributing

See `CONTRIBUTING.md`.

## License

MIT — see `LICENSE`.
