# Contributing

DEVCON Iligan welcomes contributions to this dashboard. This is an early,
pre-alpha project — expect the structure to change as the 8 MVP indicators
come online.

## Before you start

- Read `CLAUDE.md` first. It holds the non-negotiable rules for data
  handling, labeling, and scope. A contribution that violates these (a
  fabricated figure, an unlabeled derived value, individual-level data for a
  vulnerable group) will be rejected regardless of code quality.
- Check open issues/discussions before starting new work to avoid
  duplicating effort.

## Data contributions

- Never invent a coordinate, population figure, or indicator value. If you
  don't have a citable source, leave the field `null` and note the gap
  instead.
- Every value needs a `source` and, where known, a `responsible_office`.
- Sample/fixture data must live in files named `*.sample.json` and must
  never be merged into anything presented as real data.

## Code contributions

- Keep the stack boring: a static frontend plus a scheduled Node job that
  writes JSON. No database, no auth, no framework lock-in without
  discussion first.
- No secrets or API keys committed. Use environment variables / GitHub
  Actions secrets for the fetch job.

## Getting help

Open an issue, or reach out to DEVCON Iligan directly.
