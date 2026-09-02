# Iligan El Niño ESG Resilience Dashboard

A public, barangay-level dashboard tracking El Niño / heat and drought risk
across Iligan City's 44 barangays, organized on three pillars: Environmental
(what is happening), Social (who is affected), and Governance (what the city
is doing).

## Who we are

DEVCON Iligan (Developers Connect Philippines, Iligan chapter) is a volunteer
civic-tech community. We are building this dashboard independently, without
an MOU or mandate from the City of Iligan. The City of Iligan is the
beneficiary and the owner of any operational data referenced here — this
project does not speak for the city and is not a city office.

## Status: pre-alpha, open data only

- No live city data is flowing yet.
- Only public, citable reference data is populated so far (barangay list,
  PSGC codes, PSA population figures).
- None of the 8 MVP indicators (see `CLAUDE.md`) are wired to a real source
  yet.
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
| `scripts/fetch/` | Planned scheduled Node job that pulls PAGASA/Open-Meteo/city data and writes JSON to `data/`. Not implemented yet. |
| `src/` | Static frontend: single-page ESG dashboard (scorecard, hero card, ranked table). No map in the MVP — see CLAUDE.md's Phase 2 section. |

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

Nothing runs yet — this is a data/schema scaffold only. Once the fetch job
and frontend exist:

1. `npm install`
2. `npm run fetch` — runs the scheduled fetch job locally, writes JSON to `/data`
3. Serve `/src` with any static file server to view the dashboard locally

## How to deploy

Target: GitHub Pages or Cloudflare Pages — static hosting, zero running
cost. A GitHub Actions workflow will run the fetch job on a schedule, commit
the updated JSON, and redeploy the static site. No database, no server, no
dependency on a single person's account.

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
