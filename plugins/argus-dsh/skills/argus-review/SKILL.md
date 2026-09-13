---
name: argus-review
description: Orchestrates a complete multi-perspective Argus code review of a change — correctness, security, performance, and architecture — each specialist recording evidence-backed findings, then an adversarial challenger validating every one before a deduplicated, ranked report. Use when the user asks for a "code review", "argus review", "revisão de código", "review this PR/diff/change", or a full audit of changed code.
---

# Argus Full Review

> **DSH host.** This skill runs on the DeepSeek Harness. Argus is reached
> through MCP, so every Argus tool is namespaced `mcp__argus__<tool>`
> (for example `mcp__argus__argus_init`). The specialist reviewers and
> the adversary are model-facing tools that carry their own reviewer persona:
> `argus_architecture`, `argus_challenger`, `argus_correctness`, `argus_performance`, `argus_security`. Call them as tools —
> they replace the named subagents of the other hosts and inherit the Argus
> skills and MCP tools.

A complete multi-perspective review of a code change, with adversarial
validation. Prefer this over ad-hoc reviewing whenever the user wants their
change reviewed.

## The pipeline

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

1. **Init.** `mcp__argus__argus_init` with the host's absolute workspace root as
   `repo_path` (and pass `--base`/`--commit`/paths if given). Read the
   overview and `reviewableFiles`. If nothing reviewable changed (only
   docs/config/assets), stop and say the change needs no review.

2. **Select reviewers.** Do not reflexively run all four — pick by what changed:
   - correctness: almost always (logic, state, concurrency, edge cases);
   - security: input handling, auth, IO, crypto, serialization, secrets;
   - performance: DB/query code, loops, network, hot paths, algorithms;
   - architecture: new modules, cross-layer calls, growing responsibilities.

3. **Review.** Record each selected reviewer as `started` with
   `mcp__argus__argus_record_reviewer_run`, then dispatch the matching specialist reviewer tools
   (`argus_correctness`, `argus_security`, `argus_performance`,
   `argus_architecture`), each over concrete files, each recording findings via
   `mcp__argus__argus_record_finding`. Run independent ones in parallel. Never assign
   "review the repo" — one lens, specific files. Record `completed` or `failed`
   when each reviewer returns. If these reviewer tools are unavailable, apply the
   matching review skills sequentially in the coordinator instead.

4. **Challenge.** For every candidate (`mcp__argus__argus_list_findings status=candidate`),
   dispatch `argus_challenger` to try to refute it and record CONFIRMED /
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
   previous/historical/imported findings and their evidence. For a reworded or
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
   Each surviving ID must occur exactly once. Choose an existing canonical ID,
   explicitly check each member's category, and justify why the members describe
   one defect. Never merge solely by title, line proximity, lens, or shared fix.
   Use the causal-independence procedure in the correction reference for disputed
   splits. Different invariant labels, Challenger votes and examples are not
   proof; a shared cause may have several consequences in one canonical finding.
   The runtime checks coverage and identity, not semantic truth. It preserves
   member IDs and reviewer provenance but does not union member claim text.
   Any later finding/verdict/correction change requires reconciliation again.
   `mcp__argus__argus_report` refuses missing/stale reconciliation or pending verdicts,
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

6. **Present.** Lead with the top findings. Each: `severity · category ·
   file:line`, the problem, the evidence, the concrete impact, the fix. Report
   the funnel: N candidates → M rejected by challenger → K duplicates merged →
   final findings. Include baseline state (`new`, `persistent`, `regression`) and
   previous findings not redetected when present (never claim fixed without
   verification). Explain that `new` means newly identified against recorded
   history, not proof that the code defect was just introduced. Disclose unresolved
   split decisions. Write for the developer; do not narrate your
   own process.

## Related skills

Load `correctness-review`, `security-review`, `performance-review`,
`architecture-review` for each lens's heuristics, and `challenger-validation`
for the refutation gates.
