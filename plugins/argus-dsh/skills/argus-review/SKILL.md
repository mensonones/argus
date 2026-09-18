---
name: argus-review
description: Orchestrates a complete multi-perspective Argus code review of a change — correctness, security, performance, and architecture — each specialist recording evidence-backed findings, then an adversarial challenger validating every one before a deduplicated, ranked report. Use when the user asks for a "code review", "argus review", "revisão de código", "review this PR/diff/change", or a full audit of changed code.
---

# Argus Full Review

> **DSH host.** This skill runs on the DeepSeek Harness. Argus is reached
> through MCP, so every Argus tool is namespaced `mcp__argus__<tool>`
> (for example `mcp__argus__argus_init`). The specialist reviewers and
> the adversary are model-facing tools that carry their own reviewer persona:
> `argus_architecture`, `argus_challenger`, `argus_correctness`, `argus_performance`, `argus_security`, `argus_tests`. Call them as tools —
> they replace the named subagents of the other hosts and inherit the Argus
> skills and MCP tools.

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
specialist reviewer tools, one lens each.

Before recording findings, read [the evidence packet contract](references/evidence-package.md).
Also read [root causes and Challenger corrections](references/challenger-corrections.md).
Pass it to reviewers and the Challenger. Include `evidencePackage` when the
snapshot and observations can be established; never fabricate missing evidence.

## Steps

### Scope, dispatch identity and retained claims

Choose init `mode` from the user's explicit scope; otherwise leave it `auto`.
Auto selects `working-tree` when staged/unstaged/untracked reviewable changes
exist within the requested paths/config, otherwise `branch-commits`.
"Only commits, not merges" means `mode: "branch-commits"`, even with local edits.
This mode selects SHAs reachable from pinned HEAD but not the pinned base tip,
excluding merge commits, and returns `patchSets` comparing each SHA to its parent.
Pass the actual relevant patch sets, their SHA/parent and the exact scope to
each reviewer; do not substitute the integrated snapshot or current file list.
Working-tree sets preserve staged and unstaged separately; the same path may
occur more than once. No eligible local changes or own commits means no change
to review; do not invent a scope or claim clean files were reviewed.
`integrated-branch-diff` remains available explicitly and may include merge
resolutions. `git log --no-merges` alone never filters an integrated diff. Compare
candidate behavior against the pinned base and disclose pre-existing issues as
context, not introduced regressions. Baseline NEW is not Git introduction.

In branch-commits mode, each candidate must supply `source_commits` from the
selected patches touching its file. Inspect that commit's parent and tree (use
`git show <sha>:<path>`), not only HEAD: an intermediate change can be reverted
later. Momo must establish whether each defect remains at pinned HEAD. Keep
historical-only issues out of the current actionable findings and disclose
them as historical context; do not claim resolved baseline without verification.
Present the recorded mode and selected SHAs, not an independently counted log.

After dispatch, send Momo the exact child ID returned by the host before it
records verdicts. Never use an ID placeholder or derive identity from
CODEX_SESSION_ID, which may identify the parent. Supply `mcp__argus__argus_report.provenance`
as `{coordinator_id,dispatched_challenger_ids}` from actual host outputs. All
delegated verdicts, including rejections, must match this list and not the parent.
Missing/mismatched provenance blocks reporting; fix verdicts while active.
The runtime compares supplied IDs, not host-certified execution evidence.

Multi-member reconciliation requires `causal_analysis` assessing concrete
separate-prevention counterfactuals; same flow or a broad "complete the flow"
fix is not a causal mechanism. Split independent omissions. Provide
`claim_coverage` for every retained consequence of every member: `finding_id`,
`source_claim` quoting its current validated description/evidence/impact, and
exact canonical `description_excerpt`, `evidence_excerpt`, `impact_excerpt`.
If the canonical evidence packet exists, also provide `observation_excerpt`
from `observed`. Correct canonical content before grouping; reconciliation
prose/recommendations cannot replace it. Runtime checks reference presence/member
coverage, not semantic completeness or equivalence; assess those yourself.

1. **Init.** `mcp__argus__argus_init` with the host's absolute workspace root as
   `repo_path` (and pass `--base`/`--commit`/paths if given). Read the
   overview and `reviewableFiles`. If nothing reviewable changed (only
   docs/config/assets), stop and say the change needs no review.

   Keep returned `repoRoot` and `roundId` as the shared context. Include
   `repo_path=repoRoot` and `round_id=roundId` in each child assignment and every
   child's MCP call. A child may attach with `mcp__argus__argus_init` using ONLY this pair;
   this never creates a round or recomputes the diff. Never have a child call
   ordinary init: `mcp__argus__argus_init` now refuses to open a round while one is active
   (it does not silently replace it). Pass overview, scope, enabled lenses and
   stack suggestions and relevant `patchSets` too; attach returns the stored
   scope and patches without recomputing a review plan.
   Verify returned candidate IDs in the coordinator's list before dispatching
   Momo. On context errors, stop and verify the pair and shared database; never
   recreate candidates to hide persistence failures. If — and only if — the round
   is genuinely unrecoverable, the coordinator (never a child) ends it explicitly
   with `mcp__argus__argus_abandon_round` (round_id + audited reason), then opens a fresh
   round; do not start a parallel round to "recover" a review. Explicit context
   neither bypasses permissions nor copies databases.

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
   `mcp__argus__argus_record_reviewer_run`, then dispatch the matching specialist reviewer tools
   (`argus_correctness`, `argus_security`, `argus_performance`,
   `argus_architecture`, `argus_tests`), each over concrete files, each recording findings via
   `mcp__argus__argus_record_finding`. Run independent ones in parallel. Never assign
   "review the repo" — one lens, specific files. Record `completed` or `failed`
   when each reviewer returns. If these reviewer tools are unavailable, apply the
   matching review skills sequentially in the coordinator instead.

   Host note: some hosts cannot select a custom agent by name from a tool-backed
   session — Codex `spawn_agent` only takes a generic type plus overrides
   (openai/codex#15250). There, load the reviewer's persona instructions (its
   `argus-<lens>` agent definition / `~/.codex/agents/<name>.toml`
   `developer_instructions`) and inject them into a generic worker; disclose the
   run as a generic worker with injected instructions, and never claim a
   host-loaded custom role. A persona name in the prompt is not a loaded role.

4. **Challenge.** For every candidate (`mcp__argus__argus_list_findings status=candidate`),
   use the host's actual subagent dispatch capability when available. Launch
   Momo with the `argus_challenger` persona instructions, `challenger-validation`,
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
   The `agentId` must be the child's own dispatched id from the host, never the
   coordinator's thread id. After verdicts are recorded, inspect each and confirm
   every `mode=delegated` verdict carries its child's dispatched id and none
   carries the coordinator's own id; if any is wrong, have that child re-record
   the corrected `execution` now, while the round is still `active`. Provenance
   cannot be repaired later: a `reported` round refuses further verdict or
   metadata changes, so never call `mcp__argus__argus_report` with a delegated verdict that
   still carries the coordinator's id.
   Have the Challenger try to refute it and record CONFIRMED /
   PLAUSIBLE / REJECTED via `mcp__argus__argus_record_challenge`. High/critical candidates
   should include a reproduction or negative control when practical. Never skip
   this. A coordinator must never suppress a finding on its own; suppression is
   an explicit maintainer decision with a recorded reason and optional expiry.
   Validate every material claim, not just the core defect. Use `correction`
   to remove unsupported impact/scenario/evidence while preserving a valid
   finding, and replace its packet. Validate a shared `rootCause` triple for
   cross-lens duplicates; assess independence from evidence, not invariant labels.

5. **Reconcile, then report.** List all surviving findings after the Challenger.
   Call `mcp__argus__argus_baseline_findings` (CLI: `argus baseline-list`) to inspect canonical
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
   Call `mcp__argus__argus_reconcile` with `groups` using the contract below, even if `[]`.
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
   truthfully, and settle delegated-verdict provenance: confirm every
   `mode=delegated` verdict carries its child's real dispatched `agentId` and
   none carries the coordinator's own id. Fix any wrong `execution` now, while
   the round is still `active` — a `reported` round refuses later verdict or
   metadata corrections. `mcp__argus__argus_report` refuses reviewers still `started`,
   missing/stale reconciliation or pending verdicts,
   applies the explicit groups, and ranks by
   `severity × confidence × challenge × validation`, applies the severity floor,
   and writes to `.argus/exports/`.

   Example group (`argus reconcile --json '<array>'` is the CLI fallback):
   ```json
   [{"canonical_id":"surviving-id","members":[{"finding_id":"surviving-id","category":"security"}],"rootCause":{"symbol":"updateAccount","mechanism":"missing-owner-check","invariant":"only-owner-may-update"},"reasoning":"One validated owner-check defect.","claims_reviewed":true}]
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
