---
name: react-review
description: Supplement an Argus review of changed React components or hooks with React state and effect semantics. Load only after confirming React usage in assigned code; a dependency declaration alone is not enough. Not a standalone lens or React Native/Next.js platform audit.
---

# React review supplement

Keep the assigned reviewer/category and scope. Confirm React imports, component
or hook usage and the project's installed version; manifest ranges are not
installed versions. This supplement does not enable another reviewer.

- Trace successive renders and user actions. State setters affect a subsequent
  render; read-after-set is not automatically wrong. Show an incorrect output or
  lost update before recommending an updater; do not report every direct setter.
- Inspect reactive effect inputs and cleanup. Show a stale subscription/result
  or unreleased resource on a reachable update/unmount. Ref/constant reads are
  not necessarily reactive dependencies; lint warnings alone are not findings.
- Check overlapping async effects for an older response overwriting current
  state. Account for cancellation, ignore flags and existing data-layer guards.
- Development Strict Mode can repeat effect setup/cleanup. That repetition
  alone is expected, not proof of a production duplicate operation.
- Ordinary hooks need consistent ordering, but React's `use` has different
  conditional/loop rules. Confirm the actual API before alleging a hook violation.

Prefer existing component tests or isolated controls without editing reviewed
files. Record the concrete render/action sequence, observed failure, controls
and limitations. Do not recommend memoization without an evidenced performance
problem. No new category, blanket SSR assumptions or platform-specific findings.
Candidates still require Challenger validation and explicit reconciliation.

## Primary references

Checked 2026-09-17. Consult docs matching the installed version when needed:

- [Effect lifecycle and dependencies](https://react.dev/reference/react/useEffect)
- [State snapshots and updater semantics](https://react.dev/reference/react/useState)
- [Hook rules and the use exception](https://react.dev/reference/rules/rules-of-hooks)
