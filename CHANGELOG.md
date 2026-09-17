# Changelog

## Unreleased

- Formalized release scope, RC/stable completion gates, host/stack validation and real-diff evaluation requirements in ROADMAP.md. CI reasoning-engine choice is an explicit prerequisite; future alpha numbers/dates are not promised.

## 0.3.0-alpha.5 — 2026-09-17

- MCP calls accept explicit shared repo_path + round_id; fresh child instances can record candidates and verdicts in the coordinator round without initializing a separate review.
- argus_init can attach to an existing round without changing scope or creating/abandoning rounds. Stale, wrong-repository and incomplete context is rejected; implicitly attached instances stay pinned.
- Coordinator/Challenger instructions prohibit recreating candidates to conceal failed persistence. Schema v4 and 14 MCP tools are unchanged; an isolated three-process MCP regression test exercises shared IDs and rejected contexts.

Validated with 54 automated tests and an installed-package MCP handshake.
Reinstall all host definitions and start a fresh session. Shared context requires
access to the same repository database; it does not bypass host isolation.

## 0.3.0-alpha.4 — 2026-09-17

- Challenger dispatch is required when host delegation is available; coordinator fallback must disclose why delegation could not run and load the validation instructions.
- Verdicts accept execution provenance (delegated child ID or coordinator fallback), retained in SQLite/JSON and disclosed in readable reports. Legacy verdicts remain unspecified; metadata is agent-reported, not proof of independent execution. Schema v4 and 14 MCP tools remain unchanged.

Validated with 53 automated tests and an installed-package MCP handshake.
Reinstall host definitions and start a new session before repeating validation.

## 0.3.0-alpha.3 — 2026-09-17

- Named personas: Argus, Atena, Cerbero, Hermes, Dedalo, Temis and Momo.
- Init exposes the display catalog; agent prompts, generated descriptions and readable reports use persona names while technical IDs and JSON/SQLite provenance remain stable.
- Host-assigned instance names are not controlled by Argus; delegation must load the actual persona instructions and skills.

Validated with 52 automated tests and an installed-package MCP handshake (14 tools).
SQLite schema remains v4. Reinstall host definitions and start a new session.

## 0.3.0-alpha.2 — 2026-09-17

- React and node:test supplements enrich existing reviewers without adding categories or enabling lenses.
- argus_init.stackSkills suggests supplements only within the nearest inspected package, for reviewable files and enabled reviewers, with code confirmation required.
- Routing, async assertion controls, packaged skills and host installation diagnostics are tested; live React review quality is not yet evaluated.

- Structured JS/TS stack hints in argus_init and reviewer context, with manifest provenance and declared test runners/package managers.
- Root and changed-path ancestor manifests support affected monorepo packages, with bounded inspection, malformed-manifest warnings and external-target exclusion.
- Recorded the first Codex Tests Reviewer synthetic workflow observation; broader stack ecosystems and additional stack skills remain pending.

SQLite schema remains v4 and MCP tool count remains 14. Reinstall host
definitions and start a new session to load stack hints and the two supplements.

## 0.3.0-alpha.1 — 2026-09-17

- Opt-in Tests Reviewer and tests-review skill for concrete test reliability defects.
- Coordinator selection, generated Codex/OpenCode/DSH agents and installation diagnostics cover the new lens.
- Default tests reviewer remains disabled; existing SQLite schema and MCP tools are unchanged.

First v0.3 prerelease: stack detection and stack-specific skills remain planned.
Reinstall host definitions and restart in a new session before using the new reviewer.

## 0.2.6 — 2026-09-13

- Compact, paginated baseline queries with file/symbol filters and exact-ID evidence retrieval.
- Reconciliation confirms applied primary identities, match modes, baseline states and incorporations per group.
- Reports refuse reviewers still started; complete or record failure before closing a round.
- Updated coordinator instructions across supported hosts. No schema migration or new MCP tool.

## 0.2.5 — 2026-09-13

- Explicit incorporated_baselines links retain covered historical consequences,
  rationale and destination canonical IDs without claiming a fix or absence.
- Reports/JSON distinguish incorporated history from unmatched findings; links
  survive filtering in canonical snapshots, without silently asserting coverage
  in later rounds. Identity conflicts and unknown/cross-file references fail.
- Maintainer accepted one loadAccounts finding with two verified consequences
  for this lab diff; original artifacts and pilot labels remain unchanged.
- Reorganized README status into released capabilities, plans and validation limits.

SQLite schema remains v4 and MCP tool count remains 14. Incorporation is optional;
each current round must validate and explicitly record covered consequences.
Reinstall host definitions and restart the host before using this workflow.

## 0.2.4 — 2026-09-13

- Reconciliation guidance uses causal evidence and targeted controls for disputed
  splits, not Challenger voting, invariant labels or literal instructional examples.
- Clarified NEW baseline semantics and recorded the DSH lab observation pending
  human adjudication, without changing pilot labels or scoring it as ground truth.

Instruction-only reconciliation changes; no new MCP tools or SQLite migration
(schema remains v4). Reinstall host definitions and restart the host to load them.
Unit/package validation does not demonstrate improved model behaviour.

## 0.2.3 — 2026-09-12

- Canonical historical snapshots preserve reconciled groups, reviewed categories,
  provenance and stable baseline identities before report filtering/suppression.
- `argus_baseline_findings` / `argus baseline-list` and audited explicit
  `baseline_match` links support persistence across wording/category changes.
- Unknown/cross-file links and reuse of one identity across distinct groups fail;
  conflicting validated root causes block automatic title-based matching.
- Older reconciled rounds are reconstructed without changing their original data.

SQLite schema remains v4. Reinstall host definitions and restart the host before
testing the historical identity workflow. Match reasoning is agent-reviewed,
not a runtime certification of semantic equivalence.

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
