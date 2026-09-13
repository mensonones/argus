# Argus Eval — pilot v1

Live workflow notes in `observations/` are unscored and may contain unresolved
findings. Keep them out of blinded reviewer inputs. The
[DSH lab observation](observations/2026-09-12-dsh-lab.md) records a disputed split
pending human adjudication, not an extra pilot issue or a model ranking.

This is a small synthetic smoke suite, **not** evidence of production review
quality or a leaderboard. Eight authored cases pair a defect and a correct
control for each current lens. Sources are standalone snapshots with explicit
requirements, not historical PR diffs. Add real, licensed PRs with before/after
revisions and independent human annotations before claiming broad effectiveness.

## Run a reviewer evaluation

1. Run `npm run eval:prepare`. Give only that output to the reviewer in a fresh
   session, not `dataset.json` or its issue labels. Treat each case independently.
   Public IDs are neutral `task-01` through `task-08`; the adjudicator maps them
   to dataset cases in the same order. Do not disclose bug/control case names.
2. Run three separate configurations with identical model, tasks and budget:
   `single` (one reviewer), `specialists` (specialists without Challenger), and
   `full` (specialists plus Challenger). Preserve raw candidate findings, final
   consolidated findings and actual Challenger verdicts outside Git unless the
   artifacts are intentionally published. Do not fabricate reviewer executions.
3. A human adjudicator maps each reported candidate to its exact ground-truth
   `issueId`, or `null` for a false positive. Match root cause, consequence and
   location, not similar titles. Record a reason. For a full run, use the actual
   CONFIRMED/PLAUSIBLE/REJECTED verdict; otherwise use NOT_CHALLENGED.
4. Run `npm run eval:score -- /absolute/path/run.json`. All eight cases are
   mandatory, including empty candidate arrays for clean reviews. Score after
   the same consolidation policy for every configuration; duplicates count as
   noise. Failed/unreviewed cases are not empty reviews: do not score an
   incomplete run as if it completed.

Run structure (repeat cases for the entire corpus):

```json
{
  "schemaVersion": 1,
  "dataset": "argus-pilot-v1",
  "configuration": "full",
  "host": "actual host and version",
  "model": "actual model/version or explicitly unknown",
  "revision": "Argus commit SHA",
  "adjudicator": "human identifier",
  "cases": [{
    "caseId": "correctness-bug",
    "candidates": [{
      "id": "raw-finding-id",
      "issueId": "empty-average",
      "verdict": "CONFIRMED",
      "reason": "Identifies empty-input division by zero in average.js."
    }]
  }]
}
```

The scorer reports candidate/final precision, recall and F1; true candidates
rejected by the Challenger; false candidates rejected; and the fraction of clean
control cases receiving a surviving comment. PLAUSIBLE survives, matching the
runtime. An undefined precision is `null`, not perfect precision. Runtime/unit
tests exercise the scorer with artificial annotations; they are not model runs.

Record elapsed time, retries, raw outputs, prompt versions and token/cost data
when the host exposes them. These are not inferred by the scorer. Repeat runs
to measure variability. A human review comment is not automatically exhaustive
ground truth; investigate unmatched findings before labelling them false.

No API key, model invocation or arbitrary repository command execution is
introduced by this suite. The developer's existing assistant runs the review.
