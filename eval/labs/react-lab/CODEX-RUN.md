# React lab on Codex — run sheet

**Do not give this file to the reviewer.** It names the expected outcome. Paste only
`codex-prompt-round1.txt` and, in a second fresh session, `codex-prompt-round2.txt`.

Purpose: RC criterion 3 (host matrix) and the open T1 item in
[`../../TRIAGE.md`](../../TRIAGE.md). Ground truth is in [`README.md`](README.md).

## Before

1. Target: a dedicated clone, `argus-react-lab-codex`, branch `feature/hooks-tweaks`
   at `ce58eda`, local `main` at `ac664f3`, clean tree, no `.argus/` (so round 1 has no
   baseline inherited from the Claude Code rounds).
2. The Codex marketplace `argus-marketplace` must point to a checkout at
   `0.3.0-alpha.13` or newer, with agents installed by `npm run install:codex` from
   that same checkout and `npm run doctor:codex` all green.
3. Update/reinstall the `argus` plugin inside Codex so its cache is not `alpha.12`,
   then start a **fresh** session in the target folder. Trust the folder if asked.

## Record, for each round

- Codex version (app and model), Argus `runtimeVersion` from `argus_init`.
- Effective Challenger mode: delegated, or fallback with injected instructions
  (openai/codex#15250). A fallback can pass integration but does not prove delegation.
- Each Challenger dispatch ID and whether the report's provenance line matches.
- Whether each lens recorded its own run (`argus_record_reviewer_run`).
- Report path under `.argus/exports/`.
- Anything blocked by the environment. A blocked run is recorded as blocked, never as
  a review without findings.

## Expected (same as the Claude Code rounds)

- Round 1: D1 `useCart`, D2 `useWindowWidth`, D3 `useUserSearch` reported; C1 `useToggle`,
  C2 `useDocumentTitle`, C3 `useUser` not reported.
- Round 2, same code: D1 to D3 come back `persistent`, no control accused.
- Severity may vary between rounds (known, T3). Semantic match counts, not literal titles.

## After

Send the two report files and the notes above; the observation goes in
`eval/observations/` and T1/T6-adjacent items in `eval/TRIAGE.md` are updated.
