# Iligan Climate+

## Who we are
This is a City Government of Iligan initiative, from CDIIS — Center for
Digital Iligan, Innovation and Sustainability — via the Digital Creatives
Hub, in collaboration with DEVCON Iligan (Developers Connect Philippines,
Iligan Chapter), whose resources were used. The collaboration is confirmed
by CDIIS.

Because a city office's name is on this dashboard, every figure on it reads
as official. That makes the modelled-vs-authoritative distinction MORE
important, not less:
- PAGASA remains the authoritative source for heat index and El Niño
  advisories. Open-Meteo is model data and must always be labelled as such.
- This dashboard is a MONITORING TOOL, not an advisory. It must never be
  worded as though the City is issuing a warning, declaration, or advisory.
- Never imply City endorsement of a figure the owning office has not
  confirmed. NO DATA / PENDING and the named owning office stay exactly as
  they are.
- Data ownership is unchanged: each operational dataset belongs to the
  office that produces it and is displayed only once that office confirms
  it.

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
2. Every derived value must render with the label: "Heat index values shown
   here are computed from Open-Meteo model data. PAGASA — iHeatMAP, the Heat
   Index page, AWS readings and ENSO advisories — remains the authoritative
   reference for official heat index values and El Niño declarations. Values
   marked derived are modelled, not observed." Every page must also carry:
   "This is a monitoring tool, not an advisory. Official heat and El Niño
   advisories for Iligan are issued by PAGASA and by the City Government of
   Iligan through its authorized offices." See src/js/chrome.js for the
   single source of truth for both — never re-type them inline.
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
- A choropleth/boundary map: filled barangay polygons imply area coverage we
  don't have. Still deferred until NAMRIA/PhilGIS/City CPDO boundary data
  exists.
- A point map (44 markers from data/barangay_reference_points.json, no
  polygons) is in scope now — it doesn't claim boundary coverage, just plots
  the same reference points already used to sample the weather grid, and is
  itself the honest way to show that the data is point-sampled, not an area
  average.

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
- Flag anything that could read as an official advisory, warning, or
  declaration that the owning office hasn't actually confirmed — this
  dashboard carries the City's name now, so that distinction matters more,
  not less.
