# React lab on Codex — two fresh sessions

Unscored workflow observation on a synthetic lab, not blinded model evaluation and
not evidence of general review quality. Do not give this note to reviewers as task
input. Ground truth: [`eval/labs/react-lab`](../labs/react-lab/README.md). Run sheet:
[`CODEX-RUN.md`](../labs/react-lab/CODEX-RUN.md).

## Setup

- Argus: `0.3.0-alpha.13`, reported by `argus_init` in both rounds. The Codex
  marketplace had pointed at an older checkout (alpha.12, seven commits behind); it was
  fast-forwarded and the custom agents reinstalled (`doctor:codex` all green) before
  the run.
- Host: Codex Desktop, `cli_version` `0.171.0-alpha.13` (Codex's own version, unrelated
  to Argus's), source `vscode`. Model `gpt-6.2-sol` with reasoning effort `high` in
  every turn of both rounds, read from `turn_context` in the session rollouts under
  `~/.codex/sessions/2026/11/22/` (parents `01a2046f…` for round 1, `01a20476…` for
  round 2).
- Target: `argus-react-lab-codex`, a fresh clone with no `.argus/`, branch
  `feature/hooks-tweaks` at `ce58eda`, local `main` at `ac664f3`, clean tree in both
  rounds. Source files were not edited between rounds.
- Each round was a new session with the prompts in the run sheet. The round 2 prompt
  told the coordinator to use and link the previous baseline.

## Results

| | Round 1 (`51f75304`) | Round 2 (`aa49ff90`) |
| --- | --- | --- |
| Scope recorded | `integrated-branch-diff`, working tree included | `branch-commits` over `b79977e`, `e5e8b83`, `ce58eda`, working tree not included (`no-reviewable-local-changes`) |
| Candidates / final findings | 5 / 5 | 6 / 5 (one resize duplicate merged) |
| Defects found | D1 `useCart`, D2 `useWindowWidth`, D3 `useUserSearch` | same |
| Controls accused | none | none |
| Severity | all medium | all medium |
| Baseline | all `NEW` | all five `PERSISTENT`, identities preserved one to one |
| Specialists | 4 delegated, each self-recorded its run (security: 0 candidates) | same |
| Challengers | 5 delegated, 5 CONFIRMED (2 with corrections), 0 rejected | 6 delegated, 6 CONFIRMED, 0 rejected |
| Validation | static-analysis, reviewer-reported | same |

Challenger dispatch ids are Codex agent paths (`/root/momo_*`), not UUIDs. Every
report states the ids match the coordinator-supplied ones, "not host-certified".

## What this supports

- The criterion-1 pattern holds on a second host: delegated specialists and
  Challengers, candidates and verdicts recorded by the children, three defects found,
  no control accused, and all findings `persistent` on the second round.
- The coordinator linked the baseline on the first reconcile and the persistence
  carried across a scope change (see below).
- Specialists record their own runs on Codex as well, including a lens with no findings.

## What this does not support

- **D1 was reported as three findings in both rounds** (`useCart`: stale render,
  batched add overwriting a removal, mutation of the caller's `initialItems`), each
  with its own root-cause triple. Reconciliation merged none. All three share the
  recommendation `setItems(c => [...c, item])`. The reconciliation text argues they
  are independent because copying the seed alone fixes only one. That is a causal
  independence call that has not been adjudicated; on Claude Code D1 was one finding.
  The lab's ground truth counts three defects, so "five persistent" is consistent
  with it but is not the same grouping as on Claude Code.
- **What the host rollouts show about delegation.** The parent sessions called
  `spawn_agent` 9 times in round 1 (4 lenses, 5 Challengers) and 10 in round 2 (4 lenses,
  6 Challengers), each with `agent_type` set to the Argus role (`argus-correctness`,
  `argus-security`, `argus-performance`, `argus-architecture`, `argus-challenger`) and a
  `task_name`. Each child rollout is a real subagent thread (`thread_source: subagent`,
  `depth: 1`, forked from the parent) whose `agent_role` is that role and whose
  `agent_path` (`/root/momo_resize`, ...) equals the dispatch id the report lists. So
  the host did create role-tagged children matching the reported ids, and the report's
  "delegated" is not a fabrication. The `message` argument is encrypted in the rollout.
  This differs from the generic-worker workaround the README describes for
  openai/codex#15250, so that limitation may not apply to this Codex build in this
  mode; that is one build and not a general finding.
- **Not established:** whether the role's `developer_instructions` were applied to the
  child. The rollout stores no developer message with the Momo persona; the persona text
  appears in the `spawn_agent` role listing and in files the child read. The Challenger
  details in the reports vary in wording ("Host-loaded", "Host-dispatched", "Delegated
  Momo role") and remain agent-reported.
- **Scope differed between rounds on identical code** (integrated diff with working
  tree versus selected commits without). Persistence still matched, but the default
  scope is not stable across sessions.
- Reviewer variation: round 2 had both Atena and Hermes report the resize defect;
  round 1 only Hermes.
- Static evidence only; no candidate was rejected, so the false-positive filter was
  not exercised. One lab, one host, one model setting.
- The `coordinator_id` is declared, as decided in the roadmap.

## Open follow-ups

1. Determine whether the role instructions reach a Codex subagent when spawned by
   `agent_type` (for example a diagnostic child asked to quote its persona), and decide
   whether the README limitation on named dispatch needs a build-specific qualification.
2. ~~Adjudicate whether the three `useCart` findings are one defect or three.~~ Done:
   [adjudication](2026-11-22-d1-adjudication.md). The split follows the counterfactual
   rule and is not a false positive; it is one defect by the lab's ground truth.
