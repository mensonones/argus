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
- Host: Codex desktop app. App version **not recorded**. Model: `~/.codex/config.toml`
  sets `gpt-6.2-sol` with reasoning effort `high`; the sessions did not report the
  model, so this is the configured value, not a confirmed one.
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
- **Delegation mode is agent-reported.** The Challenger details differ in wording
  ("Host-loaded", "Host-dispatched", "Delegated Momo role"). Codex is documented as
  unable to select a custom agent by name in a tool-backed session
  (openai/codex#15250), where the coordinator must disclose a generic worker with
  injected instructions. The `spawn_agent` parameters were **not captured**, so whether
  a named agent or a generic worker ran is unverified.
- **Scope differed between rounds on identical code** (integrated diff with working
  tree versus selected commits without). Persistence still matched, but the default
  scope is not stable across sessions.
- Reviewer variation: round 2 had both Atena and Hermes report the resize defect;
  round 1 only Hermes.
- Static evidence only; no candidate was rejected, so the false-positive filter was
  not exercised. One lab, one host, one model setting.
- The `coordinator_id` is declared, as decided in the roadmap.

## Open follow-ups

1. Capture the `spawn_agent` parameters of the Challengers from the Codex transcript
   to settle named agent versus generic worker.
2. Adjudicate whether the three `useCart` findings are one defect or three, using the
   causal-independence procedure; decide whether reconciliation should have merged them.
3. Record the Codex app version and the model the session actually used.
