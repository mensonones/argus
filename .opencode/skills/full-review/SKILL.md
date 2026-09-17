---
name: full-review
description: Orchestrates a complete multi-perspective Argus code review of a change — correctness, security, performance, and architecture — each specialist recording evidence-backed findings, then an adversarial challenger validating every one before a deduplicated, ranked report. Use when the user asks for a "code review", "argus review", "revisão de código", "review this PR/diff/change", or a full audit of changed code.
---

# Argus Full Review

A complete multi-perspective review of a code change, with adversarial
validation. Prefer this over ad-hoc reviewing whenever the user wants their
change reviewed.

## The pipeline

The coordinator's persona is Argus. Init returns a `personas` display catalog:
Atena (correctness), Cerbero (security), Hermes (performance), Dedalo
(architecture), Temis (tests), Momo (challenger). Use these names in delegation
titles/prompts and readable summaries, while recording technical reviewer IDs.
Provide the selected agent's actual persona instructions and relevant skills;
a display name alone does not load them. Host-assigned instance names may differ;
do not claim that Argus can rename them. The catalog does not enable any lens.

```
Init → Select reviewers → Review (delegate) → Challenge → Consolidate → Report
```

Argus is deterministic where it can be and specialist where it must be: the
`argus_*` MCP tools (or the `argus` CLI) own the diff, the shared finding memory
(`.argus/` SQLite), dedup, ranking, and the report. The reasoning is done by
specialist subagents, one lens each.

Before recording findings, read [the evidence packet contract](references/evidence-package.md).
Also read [root causes and Challenger corrections](references/challenger-corrections.md).
Pass it to reviewers and the Challenger. Include `evidencePackage` when the
snapshot and observations can be established; never fabricate missing evidence.

## Steps

1. **Init.** `argus_init` with the host's absolute workspace root as
   `repo_path` (and pass `--base`/`--commit`/paths if given). Read the
   overview and `reviewableFiles`. If nothing reviewable changed (only
   docs/config/assets), stop and say the change needs no review.

2. **Select reviewers.** Do not reflexively run every lens — pick by what changed:
   - correctness: almost always (logic, state, concurrency, edge cases);
   - security: input handling, auth, IO, crypto, serialization, secrets;
   - performance: DB/query code, loops, network, hot paths, algorithms;
   - architecture: new modules, cross-layer calls, growing responsibilities.
   - tests: changed tests/setup or concrete test-reliability concerns; opt-in
     with `reviewers.tests: true`. Honor `enabledReviewers` from init for all lenses.

   Inspect `stackSkills` from init for optional `react-review` and
   `node-test-review` supplements. Each suggestion names the package manifest,
   relevant files, eligible enabled reviewers and declaration evidence.
   Confirm actual usage in the assigned code/runner before loading it, then
   provide it only to the relevant specialist (and Challenger if needed).
   Suggestions are not findings, version guarantees or new lenses. Preserve
   config restrictions; do not load all detected stacks into every assignment.
   Missing suggestions do not rule out a stack, especially with truncated or
   invalid manifests; inspected code can justify loading a supplement manually.

3. **Review.** Record each selected reviewer as `started` with
   `argus_record_reviewer_run`, then dispatch the matching specialist subagents
   (`argus-correctness`, `argus-security`, `argus-performance`,
   `argus-architecture`, `argus-tests`), each over concrete files, each recording findings via
   `argus_record_finding`. Run independent ones in parallel. Never assign
   "review the repo" — one lens, specific files. Record `completed` or `failed`
   when each reviewer returns. If the host cannot launch subagents, apply the
   matching review skills sequentially in the coordinator instead.

4. **Challenge.** For every candidate (`argus_list_findings status=candidate`),
   use the host's actual subagent dispatch capability when available. Launch
   Momo with the `argus-challenger` persona instructions, `challenger-validation`,
   evidence/correction contracts and relevant stack supplement; a name or role
   string alone is insufficient. Supply candidate IDs, workspace and permission
   boundaries. Wait for the child to finish and verify every verdict is recorded.
   The coordinator must not validate candidates itself merely for convenience.
   If dispatch is unavailable, prohibited or fails, disclose the specific reason
   and load those instructions before sequential coordinator validation. Do not
   claim an independent Challenger was run in this fallback.
   Record `execution` on each verdict: `mode=delegated`, actual host `agentId`
   and `detail` describing loaded instructions/delegation, or `mode=coordinator`
   with `detail` explaining the fallback. Never invent an ID. This metadata is
   agent-reported provenance, not host verification or proof of independence.
   Have the Challenger try to refute it and record CONFIRMED /
   PLAUSIBLE / REJECTED via `argus_record_challenge`. High/critical candidates
   should include a reproduction or negative control when practical. Never skip
   this. A coordinator must never suppress a finding on its own; suppression is
   an explicit maintainer decision with a recorded reason and optional expiry.
   Validate every material claim, not just the core defect. Use `correction`
   to remove unsupported impact/scenario/evidence while preserving a valid
   finding, and replace its packet. Validate a shared `rootCause` triple for
   cross-lens duplicates; assess independence from evidence, not invariant labels.

5. **Reconcile, then report.** List all surviving findings after the Challenger.
   Call `argus_baseline_findings` (CLI: `argus baseline-list`) to inspect canonical
   history in compact pages (default 20, maximum 100). Filter by `file` or exact
   `symbol`; follow `nextOffset` until `hasMore` is false. Retrieve full evidence
   for a selected historical ID using `finding_id` (CLI: `--finding-id`).
   A filtered or partial page is not proof that another historical entry is absent.
   Compare previous/historical/imported findings and their evidence. For a reworded or
   reclassified instance of the same defect, include `baseline_match` in its
   group: `{"finding_id":"historical-id","reasoning":"why the same cause and violated contract persist"}`.
   Reference an actual historical ID, not a current candidate. Do not infer
   identity from line proximity, title similarity or a shared fix. If equivalence
   cannot be established, omit the link. Each historical identity can belong to
   only one distinct current group. The runtime propagates a stable
   `baselineIdentity` and retains the match justification without changing history.
   If a previously separate finding's verified consequence is now retained in
   canonical content, use `incorporated_baselines` with its historical ID,
   reasoning and nonempty `covered_claims`, following the correction reference.
   This is incorporation, not a fix or suppression. Verify coverage this round;
   old links do not automatically prove continued coverage.
   Review every claim and explicitly partition them into distinct root causes.
   Correct canonical content first if needed: it must cover all retained,
   verified symptoms, without unsupported claims from duplicate candidates.
   Call `argus_reconcile` with `groups` using the contract below, even if `[]`.
   Inspect returned `appliedGroups`: verify each primary `baselineMatch`,
   `baselineIdentity`, `baselineStatus`, `matchMode` and `incorporatedBaselines`
   against the intended plan. Null/empty links mean no explicit link was applied;
   intentions or earlier failed calls are not stored relationships. Correct the
   plan and reconcile again if necessary. Never force historical equivalence.
   Each surviving ID must occur exactly once. Choose an existing canonical ID,
   explicitly check each member's category, and justify why the members describe
   one defect. Never merge solely by title, line proximity, lens, or shared fix.
   Use the causal-independence procedure in the correction reference for disputed
   splits. Different invariant labels, Challenger votes and examples are not
   proof; a shared cause may have several consequences in one canonical finding.
   The runtime checks coverage and identity, not semantic truth. It preserves
   member IDs and reviewer provenance but does not union member claim text.
   Any later finding/verdict/correction change requires reconciliation again.
   Before reporting, record every started reviewer as `completed` or `failed`
   truthfully. `argus_report` refuses reviewers still `started`, missing/stale
   reconciliation or pending verdicts,
   applies the explicit groups, and ranks by
   `severity × confidence × challenge × validation`, applies the severity floor,
   and writes to `.argus/exports/`.

   Example group (`argus reconcile --json '<array>'` is the CLI fallback):
   ```json
   [{"canonical_id":"surviving-id","members":[{"finding_id":"surviving-id","category":"security"},{"finding_id":"duplicate-id","category":"correctness"}],"rootCause":{"symbol":"updateAccount","mechanism":"missing-owner-check","invariant":"only-owner-may-update"},"reasoning":"Both witnesses demonstrate the same unauthorized mutation; no independent defect remains.","claims_reviewed":true}]
   ```

   `category` is mandatory on every recorded finding. Supported categories:
   correctness, security, performance, architecture, tests. Missing or invalid
   values fail instead of silently becoming correctness.

6. **Present.** Lead with the top findings.
   Disclose whether Challenger validation was delegated, performed by the
   coordinator, mixed or unspecified. Only claim delegated execution when an
   actual child was dispatched and completed; distinguish recorded metadata
   from host-visible execution evidence.
   Each: `severity · category · file:line`, the problem, the evidence, the concrete impact, the fix. Report
   the funnel: N candidates → M rejected by challenger → K duplicates merged →
   final findings. Include baseline state (`new`, `persistent`, `regression`) and
   previous findings not redetected when present (never claim fixed without
   verification). Explain that `new` means newly identified against recorded
   history, not proof that the code defect was just introduced. Disclose unresolved
   split decisions. Write for the developer; do not narrate your
   own process.

## Related skills

Load `correctness-review`, `security-review`, `performance-review`,
`architecture-review`, `tests-review` for each lens's heuristics, and `challenger-validation`
for the refutation gates.
