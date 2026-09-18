# Argus evaluation corpus — protocol (RC #4)

This is the methodology for the adjudicated, real-diff evaluation that gates
0.3.0-rc.1. It is generic and public. **The corpus data itself is private** and
lives under `eval/corpus/` (gitignored): real diffs, gabaritos and runs from
private repositories must never be published. Only aggregate metrics and this
methodology go in the public repo.

## What it proves

The corpus tests Argus's core claim as a controlled experiment: **multiple
specialist perspectives + an adversarial Challenger reduce false positives while
keeping recall.** If the `full` arm does not beat the baselines on precision
without losing recall, the claim is not supported — the experiment can refute it.

## The three arms (same diffs, same host/model/budget)

| Arm | What runs | Output collected |
|---|---|---|
| `single` | one prompt, one pass asking for all findings (baseline "an LLM reviews the diff") | its finding list |
| `specialists` | the 4 reviewer lenses, **no** Challenger, **no** reconciliation | the recorded **candidates** (`argus list --status candidate`) |
| `full` | lenses + Challenger + reconciliation (the normal `/argus:review`) | the final report findings |

Run each arm **twice** per case (LLMs are non-deterministic) with host, model and
config fixed. Record host/model/tokens/time.

## Corpus shape

Two private repos, ≥6 real diffs total, a mix of:

- **defect cases** — a diff that introduces (or contains) known bug(s); the
  gabarito lists the expected finding(s).
- **control cases** — a diff that is correct (no real defect). The gabarito is
  empty; any finding here is noise. **You need controls or you cannot measure
  false positives.** Aim for ~half controls.

Chosen repos: `3rn-mobile` (React Native, JS/TS) and `mesverso-api` (Java/Spring).
The Java repo is reviewed by the general lenses only (no stack supplements) — that
is expected and part of the coverage.

## Step 1 — Annotate the gabarito (BEFORE running Argus)

For each case, write `issues.json` **without looking at any Argus output**. This
independence is the whole point: a gabarito written from Argus's report just
grades Argus against itself.

Each expected issue:

- `id` — stable slug (e.g. `cpf-double-mask`).
- `category` — correctness | security | performance | architecture | tests.
- `file`, `lineHint` — where it lives.
- `severity` — info | low | medium | high | critical.
- `description` — the concrete defect and why it is one.
- `mustFind` — `true` if a competent reviewer should catch it (counts in recall);
  `false` for "nice to have" (does not penalize recall if missed).

Control cases: `issues: []`.

Pick diffs where you genuinely know the ground truth (you authored them, or you
can inspect and decide). Record how each defect was introduced.

## Step 2 — Run the arms (spends tokens — do this in the host)

The runtime is deterministic but the *reasoning* is the host's, so the arms are
run inside Codex/Claude Code, not by a headless script. For each case × arm × 2
runs, save the raw output into
`eval/corpus/<repo>/<caseId>/runs/<arm>/run-<n>.json` (see `eval/templates/`).
`full` and `specialists` outputs can be pulled from the target repo's `.argus`
SQLite with `eval/collect.mjs`; `single` output is saved from the baseline prompt.

## Step 3 — Adjudicate (human, per finding)

For each finding a run produced, set its `adjudication`:

- the `id` of the gabarito issue it correctly identifies, or
- `null` if it matches no real issue (**noise / false positive**).

Adjudicate by the underlying defect, not by title similarity. One real issue
reported twice = one true positive + one noise. Record disputed calls.

## Step 4 — Score

`node eval/score-corpus.mjs` reads the gabaritos + adjudicated runs and prints,
per arm and per corpus:

- **recall** = tp / (tp + fn) over `mustFind` issues.
- **precision** = tp / (tp + fp).
- **control noise** = false positives on control cases (findings where none
  should exist).
- **Challenger effect** (full vs specialists): true candidates the Challenger
  wrongly **rejected**, and noise candidates it wrongly **confirmed**.
- **variability** across the two runs (finding-set delta).
- **cost** — tokens/time when available.

## Reading the result

The claim holds if, on the same corpus, `full` shows **higher precision / lower
control noise than `specialists` and `single`, without a material recall drop**,
and the Challenger's wrong-rejects stay low. Publish the numbers **with their
limitations** (small corpus, single annotator, host/model fixed) — this measures
these diffs, not universal accuracy. A negative or mixed result is a valid,
publishable outcome.

## Privacy rules

- `eval/corpus/` is gitignored. Never commit real diffs, code excerpts, gabaritos
  or findings from the private repos.
- Only aggregate metrics (counts/rates, no code) and this methodology are public.
- Sanitize any observation note before it leaves `eval/corpus/`.
