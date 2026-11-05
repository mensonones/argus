# React lab — four fresh sessions, one host

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

## Follow-up: rounds 3 and 4 after the Claude Code adjustments

Rounds 1 and 2 above ran against the original alpha.12. After the adjustments in
the next release (see the changelog), two more fresh sessions ran the same prompt
against the same lab code: round 3 (`33335426`, installed plugin at `9d9329f`) and
round 4 (`e0d46774`, installed plugin at `9fe320d`). Same host and model.

| | Round 3 | Round 4 |
| --- | --- | --- |
| Findings | the same 3 defects, all `persistent`, no control raised | same |
| Severities (cart / search / window) | high / medium / medium | high / medium / medium |
| `coordinator_id` | the host session id, substituted into the command (matches the session directory id) | host session id, substituted |
| Specialists that recorded their own run | 3 of 4; the security lens ran as a generic worker after `argus:argus-security` failed to start twice | 4 of 4 |
| Security agent | failed at startup: `git diff origin/HEAD...` (not an Argus command) in a repo without an origin | started normally |
| Challenger dispatch ID | first attempt lacked it; two recorded `coordinator` and re-recorded `delegated` | received `dispatch_id` after launch; none recorded before it or as `coordinator` |
| Reference files | one Challenger could not read them | all four read them through absolute paths |
| First `argus_reconcile` | accepted, but a group came out `new` because the coordinator omitted the baseline link; redone before reporting | rejected (`source_claim` quoting), then accepted |

Between the rounds a diagnostic subagent run in the maintainer's own session showed that
`argus:argus-correctness` received its skill body while `argus:argus-security`
received none (a listing entry only), which led to renaming the Argus skill: Claude
Code ships a built-in skill called `security-review`, so the bare name never
delivered the Argus one. That diagnostic cannot say which agent definition that
session had loaded.

### What round 4 does not show

- That the security agent now receives the `argus-security-review` body: the agent
  started and recorded its run, but no diagnostic confirmed its content.
- The `unlinkedHistory` reminder in `argus_reconcile`: the coordinator linked the
  baseline correctly, so it never fired; it is covered by a unit test only.
- Stability of severity beyond these rounds: round 2 had `useUserSearch` high and
  `useWindowWidth` low, rounds 1, 3 and 4 did not.
- The `source_claim must quote current validated member content` rejection happened in
  rounds 2 and 4; it is a recurring friction, not resolved.
- Anything on another host, or a corpus run.

## Disposition against the roadmap

Criterion 1 (shared round in a real session, repeated) is met for this lab on Claude
Code, with caveats. Of the limitations recorded above, the following were addressed
and re-observed in rounds 3 and 4: the host-supplied coordinator id, lenses recording
their own run, the Challenger dispatch-id handoff and the unreadable reference
files. Still open: the coordinator id is agent-reported rather than host-certified,
severity variation, static-only evidence, the reconcile quoting friction and the
single-host, single-model sample.
