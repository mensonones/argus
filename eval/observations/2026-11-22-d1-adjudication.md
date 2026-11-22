# Adjudication of the `useCart` (D1) split on Codex

Closes the open follow-up of the
[Codex React lab observation](2026-11-22-codex-react-lab-two-rounds.md): in both rounds
the three-hook ground truth came back as five findings, three of them in `useCart`.
Do not give this note to reviewers as task input. It reasons about one synthetic lab.

## Question

Are the three `useCart` findings (A stale render, B batched add overwriting a
removal, C mutation of the caller's `initialItems`) one defect or three, under the
rule Argus gives the coordinator: assess concrete separate-prevention counterfactuals,
split independent omissions, and do not treat "complete the flow" as a mechanism?

## Method

The branch code is two statements: `items.push(item); setItems(items)`. Each reported
consequence was executed in jsdom with React 19.1.0 against the branch code and four
partial fixes, using [`d1-counterfactuals.mjs`](../labs/react-lab/d1-counterfactuals.mjs).
The hook variants are inlined copies; they were not read from the lab repository.

## Results

`ok` means the consequence is absent.

| Variant | A stale render | B remove then add in one batch | C caller seed mutated |
| --- | --- | --- | --- |
| V0 branch as is | FAIL | FAIL (renders `A,B`) | FAIL |
| V1 clone after push, `setItems([...items])` | ok | FAIL | FAIL |
| V2 no push, `setItems([...items, item])` | ok | FAIL | ok |
| V3 copy the seed only, `useState([...init])` | FAIL | FAIL | ok |
| V4 functional updater, as on `main` | ok | ok | ok |

All three consequences are real and reproduced by execution, not only by static
reading. None of the five Codex findings in the cart family is a false positive.

## Adjudication

- **By the Argus rule the split is correct.** Each of A, B and C has a partial fix that
  removes it and leaves another: V1 fixes only A, V3 only C, and V2 fixes A and C but
  not B. The three are therefore separable, and the reconciliation was right not to
  merge them. This is not a reconciliation defect.
- **By the lab's ground truth it is one defect.** D1 is one commit, one site and one
  natural fix (V4). All three reports recommend the same line. For scoring, the three
  findings map to D1: it is detected, with no false positive. They are not three
  independent ground-truth defects.
- **What is actually wrong is presentation.** A reader gets three medium findings with
  an identical recommendation and no sign that one change resolves all of them. The
  separate-prevention rule optimises for not hiding a distinct consequence, which is
  the safer error, and it over-splits when one canonical fix covers everything.
- **Not re-adjudicated here:** the single `useCart` finding the Claude Code rounds
  produced. Whether it retained consequences B and C was not checked, so it may have
  under-reported them.

## Decision

Keep the splitting rule. Do not change reconciliation to merge by shared
recommendation. Track as a presentation improvement: when several findings in one file
share the same fix, the report should say so (for example a "same fix as" note) without
merging their identities or hiding any consequence. This does not block the RC.

## Limits

One synthetic lab, one React version, jsdom, variants inlined rather than read from the
repository. It adjudicates this case, not the grouping policy in general.
