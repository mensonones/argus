# Running the corpus (single / specialists / full)

Public OSS corpus (MIT). Two repos, 7 cases (4 defects, 3 controls). Every case
reduces to **review one commit's diff**; a `full` Argus round yields both the
`full` and `specialists` arms, so only `single` needs a separate pass.

## Cases

| Case | Repo | control | localRef (checkout) | reviewRef (review this commit) |
|------|------|:------:|---------------------|--------------------------------|
| D1-useEventListener-options | usehooks-ts | no  | `eval/D1` | `573f9fe` |
| D2-useFetch-cancel-flag     | usehooks-ts | no  | `eval/D2` | `b1e4a30` |
| D3-isISO8601-ordinal-360    | validator.js| no  | `eval/D3` | `041c710` |
| D4-isISO8601-week-00        | validator.js| no  | `eval/D4` | `314b06a` |
| C1-useToggle-feature        | usehooks-ts | yes | `99a1882` | `99a1882` |
| C2-postalCode-AR            | validator.js| yes | `0b9654a` | `0b9654a` |
| C3-isJson-any-value         | validator.js| yes | `fcfbff5` | `fcfbff5` |

Repos are cloned at `~/dev/argus-eval/{usehooks-ts,validator.js}`. Defect cases
are `git revert` branches that reintroduce a known, later-fixed bug; the gabarito
in `issues.json` is that bug. **Do not reveal to the reviewers that a case is a
revert or a control** — they only see the diff.

`<argus>` below is this repo's path. Fix host/model across ALL runs.

## Per case

### 1. Check out the reviewed state
```bash
cd ~/dev/argus-eval/<repo>
git checkout <localRef>        # working tree must match the reviewed commit
```

### 2. FULL arm — twice
Open the host (Codex / Claude Code) **in that repo** and run, two independent times:
```
/argus:review --commit <reviewRef>
```
After each round, collect it (deterministic, no tokens):
```bash
npm --prefix <argus> run eval:collect -- \
  --repo ~/dev/argus-eval/<repo> --round latest \
  --host <codex|claude> --model <model-id> --run <1|2> \
  --out <argus>/eval/corpus/<repo>/<caseId>/runs/full/run-<1|2>.json
```

### 3. SINGLE arm (baseline) — twice
Give the host this exact prompt (no Argus), reviewing the **same** commit:

> You are a senior code reviewer. Review ONLY the change in commit `<reviewRef>`
> (`git show <reviewRef>`) in this repository. Report concrete, evidence-backed
> defects across correctness, security, performance and architecture — each with
> `file:line`, a one-line description and a severity. No style nits, no
> speculation. If there are none, say so explicitly.

Save its findings to `runs/single/run-<1|2>.json` following
`eval/templates/run.example.json` (`"arm":"single"`, `verdict` may be null).

## After all cases

### 4. Adjudicate (human)
In every `runs/**/run-*.json`, set each finding's `adjudication` to the
`issues.json` issue id it correctly identifies, or `null` for noise. Keep the
collected `verdict` on `full` findings. Adjudicate by the underlying defect, not
the title. Control cases: every finding is `null` (noise).

### 5. Score
```bash
npm --prefix <argus> run eval:score-corpus
```
Prints recall / precision / control-noise / Challenger wrong-rejects+confirms /
run-to-run variability for `single`, `specialists`, `full`.

## Rebuilding the defect branches (reproducible)
```bash
# for each defect: check out the fix commit, revert it onto a branch
git checkout <fixCommit> && git checkout -b eval/DX && git revert --no-commit <fixCommit> \
  && git commit -m "<neutral subject>"
```
Fix commits: D1 `6acb132`, D2 `59ccef4` (usehooks-ts); D3 `a38f15b`, D4 `3d2f4b3` (validator.js).
