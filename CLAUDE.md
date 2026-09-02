# Iligan El Niño ESG Resilience Dashboard

## Who we are
DEVCON Iligan (Developers Connect Philippines, Iligan chapter) — a volunteer
civic-tech community. We are the BUILDER. The City of Iligan is the
BENEFICIARY and owns all operational data. We are not a city office and never
write or present as one. We have no MOU or city mandate unless stated.

## What this is
A public-management dashboard for El Niño / heat and drought risk across all
44 barangays of Iligan City, organized on three pillars:
- E (Environmental) — what is happening
- S (Social) — who is affected
- G (Governance) — what the city is doing

Core framing: Risk = Environmental Hazard × Social Vulnerability ÷ Governance
Capacity.

## Non-negotiables — apply to code, comments, UI copy and docs
1. PAGASA is authoritative (iHeatMAP, Heat Index page, AWS, ENSO advisories).
   Open-Meteo and other model data are SUPPLEMENTARY ONLY.
2. Every derived value must render with the label: "Derived DEVCON Iligan
   indicator — not an official PAGASA declaration or City of Iligan figure."
3. Never fabricate figures. Unknown = `null` in data, "NO DATA / PENDING" in
   UI, plus the office that owns it. Any sample data file must be named
   `*.sample.json` and the UI must show a SAMPLE — NOT REAL DATA banner.
4. Every value carries a status: verified | reported | estimated | derived.
5. Every view shows a visible "last updated" timestamp and its data source.

## Data schema — use this shape everywhere
date_time, barangay, latitude, longitude, indicator, value, unit, source,
responsible_office, status, remarks

- Timezone: Asia/Manila (UTC+8). Store UTC ISO-8601, display Manila.
- Barangay is the default unit of analysis, never "the city" alone.
- Units: °C, mm, ha, L, ₱
- Heat index bands: Caution / Extreme Caution / Danger / Extreme Danger.
  Always show the band name, not just the number.
- Population baseline: PSA PSGC 2024. Cite the year in the UI.

## MVP scope — 8 indicators only
E: heat index · rainfall · water level/availability · fire incidents
S: population exposed · households with water shortage · farmers and hectares
   affected
G: government intervention/response status

The MVP is a single-page dashboard: ESG scorecard, hottest-barangay hero
card, and a sortable table of all 44 barangays. No map in phase 1.

Out of scope until these 8 are flowing: sensors, ML forecasting, mobile app,
citizen reporting portal, authentication, database.

## Phase 2 (deferred — do not build yet)
- Map view: Leaflet or MapLibre with barangay GeoJSON/boundaries.
- Anything that depends on real barangay boundary polygons (NAMRIA/PhilGIS/
  City CPDO) rather than the reference points in
  data/barangay_reference_points.json.

## Tech constraints
- Static frontend + scheduled fetch job writing JSON. No database yet.
- Deploy target: GitHub Pages / Cloudflare Pages. Zero running cost.
- Assume mobile users on limited data, and projection in meetings — legible,
  high contrast, works small.
- Boring, cheap, self-hostable. No dependency on one person's account.
- Handover-ready: documented, no magic, no local-only setup steps.

## Privacy
Aggregate to barangay level. Never store or display individual-level records
for vulnerable groups (PWDs, seniors, patients, beneficiaries) — counts only.

## How to work with me
- Lead with the answer. Be concise.
- Ask before assuming an indicator definition, threshold, or data owner.
- Push back if a change adds complexity before the 8 MVP indicators flow.
- Flag anything that could read as an official government statement.
