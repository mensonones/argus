# Changelog

## 0.2.2 — 2026-09-12

- Required explicit reconciliation before reporting: canonical/member IDs,
  reviewed categories, root cause and reasoning; complete coverage and stale-plan
  guards. Canonical claims are retained without unioning duplicate exaggerations.
- Missing or invalid finding categories now fail instead of defaulting to correctness.
- Updated generated host instructions and runtime regression tests.
- Historical findings not redetected are no longer labeled resolved without
  fix verification; JSON exposes unmatchedPreviousCount/unmatchedPreviousFindings.

Compatibility: direct CLI/MCP callers must provide a valid finding category and
reconcile before reporting. SQLite schema remains v4. Reinstall host definitions
and restart the host before reviewing with this version.

## 0.2.1 — 2026-09-12

- Challenger-validated root causes for cross-lens consolidation, keeping distinct
  violated invariants separate.
- Complete claim corrections with original-content audit history and replacement
  evidence packets; coherent corrected content survives consolidation.
- Schema v4 migration and documentation aligned with released 0.2.0 status.

## 0.2.0 — 2026-09-12

- Optional structured evidence packets on findings and Challenger verdicts,
  persisted with schema v3 and rendered in Markdown, JSON and terminal reports.
- Backward-compatible migration from existing memory databases.
- Ranking no longer rewards evidence text volume or reviewer agreement.
- Synthetic Argus Eval pilot: eight defect/control cases, blinded reviewer tasks,
  human adjudication and candidate/final precision, recall, F1 and Challenger errors.
- Updated canonical instructions, generated host adaptations and trust boundaries.

The Eval pilot does not establish production review quality. Validation methods
are agent-reported observations; Argus does not execute or certify experiments.
