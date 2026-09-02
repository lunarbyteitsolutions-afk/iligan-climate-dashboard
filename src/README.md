# Frontend

Single static page (`index.html`), no framework, no build step. Reads
`data/heat-index-latest.json` at load time.

MVP scope only: ESG scorecard, hottest-barangay hero card, and a sortable
table of all 44 barangays. No map — that's phase 2 (see CLAUDE.md), once
real barangay boundaries are available.

Deploys as static files to GitHub Pages or Cloudflare Pages, same as the
rest of the repo.
