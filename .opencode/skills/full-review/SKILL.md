---
name: full-review
description: Orchestrates a complete multi-perspective Argus code review of a change — correctness, security, performance, and architecture — each specialist recording evidence-backed findings, then an adversarial challenger validating every one before a deduplicated, ranked report. Use when the user asks for a "code review", "argus review", "revisão de código", "review this PR/diff/change", or a full audit of changed code.
---

# Argus Full Review

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
specialist subagents, one lens each.

## Steps

1. **Init.** `argus_init` with the host's absolute workspace root as
   `repo_path` (and pass `--base`/`--commit`/paths if given). Read the
   overview and `reviewableFiles`. If nothing reviewable changed (only
   docs/config/assets), stop and say the change needs no review.

2. **Select reviewers.** Do not reflexively run all four — pick by what changed:
   - correctness: almost always (logic, state, concurrency, edge cases);
   - security: input handling, auth, IO, crypto, serialization, secrets;
   - performance: DB/query code, loops, network, hot paths, algorithms;
   - architecture: new modules, cross-layer calls, growing responsibilities.

3. **Review.** Record each selected reviewer as `started` with
   `argus_record_reviewer_run`, then dispatch the matching specialist subagents
   (`argus-correctness`, `argus-security`, `argus-performance`,
   `argus-architecture`), each over concrete files, each recording findings via
   `argus_record_finding`. Run independent ones in parallel. Never assign
   "review the repo" — one lens, specific files. Record `completed` or `failed`
   when each reviewer returns. If the host cannot launch subagents, apply the
   matching review skills sequentially in the coordinator instead.

4. **Challenge.** For every candidate (`argus_list_findings status=candidate`),
   dispatch `argus-challenger` to try to refute it and record CONFIRMED /
   PLAUSIBLE / REJECTED via `argus_record_challenge`. High/critical candidates
   should include a reproduction or negative control when practical. Never skip
   this. A coordinator must never suppress a finding on its own; suppression is
   an explicit maintainer decision with a recorded reason and optional expiry.

5. **Consolidate + report.** `argus_report` refuses to run while any candidate
   lacks a Challenger verdict, then deduplicates (merging findings
   multiple reviewers agree on, which raises confidence), ranks by
   `severity × confidence × evidence × agreement`, applies the severity floor,
   and writes to `.argus/exports/`.

6. **Present.** Lead with the top findings. Each: `severity · category ·
   file:line`, the problem, the evidence, the concrete impact, the fix. Report
   the funnel: N candidates → M rejected by challenger → K duplicates merged →
   final findings. Include baseline state (`new`, `persistent`, `regression`) and
   resolved findings when present. Write for the developer; do not narrate your
   own process.

## Related skills

Load `correctness-review`, `security-review`, `performance-review`,
`architecture-review` for each lens's heuristics, and `challenger-validation`
for the refutation gates.
