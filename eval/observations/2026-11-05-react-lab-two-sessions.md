# React lab — two fresh sessions, one host

This is an unscored workflow observation on a synthetic lab, not blinded model
evaluation and not evidence of general review quality. Do not give this note to
reviewers as task input. The ground truth is in
[`eval/labs/react-lab`](../labs/react-lab/README.md).

## Setup

- Argus: 0.3.0-alpha.12, read by each session from the plugin manifest
  (`argus_init` does not return a version).
- Host: Claude Code in the Claude desktop app (Code tab); the app version was not
  exposed to the sessions. Model: `claude-sonnet-5-5`. Both sessions used the same.
- Target: `argus-react-lab`, branch `feature/hooks-tweaks` against `main`, HEAD
  `ce58eda`, clean working tree. Scope recorded: `branch-commits` over three
  non-merge commits (`b79977e`, `e5e8b83`, `ce58eda`). Source files were not
  edited between rounds.
- Each round ran in a new session started with the same prompt. Round 2 added one
  process instruction (do not end the turn while subagents run) after round 1 had
  to be nudged to continue. The prompts named no defect and did not reveal which
  hooks were controls.
- Ground truth confirmed by execution before the rounds: on `main` six behaviour
  checks pass; on the branch the three defects fail and the three controls pass.

## Round 1 — round `6ac1d51d`

4 candidates, 0 rejected, 1 duplicate merged, 3 findings, all `new`:

| Finding | Severity | Verdict |
| --- | --- | --- |
| `useCart.addItem` mutates and re-sets the same reference | high | CONFIRMED |
| `useUserSearch` stale response overwrites newer results | medium | CONFIRMED |
| `useWindowWidth` never removes its listener | medium | CONFIRMED, with correction |

The Challenger corrected the `useWindowWidth` candidate by removing two
unsupported claims (harmful setState after unmount, StrictMode doubling).

## Round 2 — round `589b61e0`

Same funnel: 4 candidates, 0 rejected, 1 duplicate merged, 3 findings. All three
defects came back `persistent`, each linked to the round 1 identity
(`bd7eca10…`, `56746c58…`, `9a9dca49…`). Severities changed between rounds:

| Finding | Round 1 | Round 2 |
| --- | --- | --- |
| `useCart` | high | high |
| `useUserSearch` | medium | high |
| `useWindowWidth` | medium | low |

## What this supports

- Both rounds reported D1–D3 and none of C1–C3; no control was raised even as a
  candidate. The same three defects persisted across two sessions.
- Specialists and Challengers ran as real child subagents in both rounds; no
  coordinator fallback. The report lists the dispatched Challenger child IDs and
  states they match the coordinator-supplied IDs. That is a comparison of
  agent-reported records, not host-certified execution.
- Atena (correctness) and Hermes (performance) wrote their candidates themselves;
  each Challenger child recorded its own verdicts.
- In round 1 the report states that the Challenger children loaded
  `argus:react-review`, so the stack supplement reached the Challenger for this
  React package. The round 2 report does not say it, so this is not shown twice.

## What this does not support

- **Coordinator identity.** `argus_report` requires `coordinator_id`, but the
  sessions had no host-supplied value. Round 1 used the session UUID taken from the
  scratchpad path; round 2 reports inventing a placeholder string. The check
  therefore proves only that the Challenger IDs match what the coordinator typed.
- **Security and architecture lenses.** In both rounds Cerbero (security) made no
  Argus MCP calls and recorded nothing, and the coordinator marked its run
  completed; in round 2 it also read only HEAD files without diffing against the
  parent commits. Dedalo (architecture) recorded nothing. With no findings in those
  lenses the result is unaffected, but their participation is not independently
  recorded.
- **Challenger ID handoff.** The host returns a child ID only after launch, so the
  coordinator had each Challenger finish its analysis, send it the real ID by
  message, and let it record the verdict. This works but depends on instructions
  being followed; the runtime cannot enforce it.
- **Reconcile friction.** Round 2's first `argus_reconcile` was rejected
  (`source_claim must quote current validated member content`) and succeeded after
  the coordinator corrected the quotes.
- **Static evidence only.** Every finding is `static-analysis (reviewer-reported)`;
  nothing was executed by the reviewers. The execution that confirms the defects is
  the lab's `verify` script, run by the maintainer.
- **Severity is unstable** between two rounds on identical code (table above).
- **Scope of the sample.** One synthetic lab, one host, one model, two rounds. It
  is not the shared-round React lab for three other hosts, not a baseline-repeat
  matrix and not a corpus run.

## Disposition against the roadmap

Criterion 1 (shared round in a real session, repeated) is met for this lab on
Claude Code with the caveats above. The coordinator identity, the lenses that do
not attach to the round and the severity variation are recorded as known
limitations; none is claimed fixed.
