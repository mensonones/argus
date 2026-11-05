# React lab — expected outcome and verification

**Do not give this file to reviewers as task input.** It contains the ground truth
of the lab.

The lab is a separate repository, `argus-react-lab` (a small React hooks library).
Branch `feature/hooks-tweaks` is reviewed against `main`; the working tree stays
clean, so the default scope reviews the three non-merge commits.

| ID | Hook | Kind | What the branch does |
| --- | --- | --- | --- |
| D1 | `useCart` | defect (state) | `items.push(item); setItems(items)`: same reference, no re-render |
| D2 | `useWindowWidth` | defect (effect cleanup) | resize listener added with no cleanup |
| D3 | `useUserSearch` | defect (stale response) | the `ignore` guard is removed, so an older response overwrites the newest |
| C1 | `useToggle` | control | exposes the setter; behaviour unchanged |
| C2 | `useDocumentTitle` | control | adds an optional suffix; effect deps and cleanup stay correct |
| C3 | `useUser` | control | `async/await` refactor that keeps the `cancelled` guard |

A correct review reports D1–D3 and nothing for C1–C3. On a second round over the
same code, D1–D3 must come back as `persistent`.

## Confirm the ground truth by execution

```bash
cd eval/labs/react-lab
npm install
npm run verify -- /absolute/path/to/argus-react-lab
```

It copies the hooks of `main` and of `feature/hooks-tweaks` and runs them with
React 19 and jsdom. On `main` all six checks pass; on the branch D1–D3 fail and
C1–C3 still pass. The script exits non-zero on any other outcome.

Observed runs against this lab:
[2026-11-05 two fresh Claude Code sessions](../../observations/2026-11-05-react-lab-two-sessions.md).
