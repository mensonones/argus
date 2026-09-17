---
name: node-test-review
description: Supplement Argus tests-review for changed tests using node:test, covering promise observation, subtests and isolation under the actual Node version. Do not apply Node runner behavior to Jest, Vitest or browser tests, or load solely because the project uses Node.
---

# Node.js test runner supplement

Confirm `node:test` usage and the actual test command, flags and Node version.
Keep `reviewer: tests`, `category: tests`; this supplement does not enable tests.

- Follow the assertion promise into the test's returned/awaited work. Missing
  await alone does not prove a false pass: uncaught exceptions or unhandled
  rejections after completion can fail the runner. A swallowed assertion error
  can instead pass. Check the process exit and diagnostics, not just one passing
  test line, using a deliberately wrong result and an awaited control.
- For subtests, establish whether the parent waits for completion. Distinguish
  cancellation or failure from an assertion silently not exercised.
- Inspect shared fixtures, global mocks and cleanup against actual concurrency
  settings; prove interference rather than assuming parallel execution.
- For timer/mock APIs, use the installed Node version's behavior. Do not infer
  support for newer flags or experimental APIs from current documentation.

Run bounded isolated probes without editing reviewed files. Keep executed and
static evidence separate, and disclose unavailable runners. Generic missing
coverage is not a finding. Challenger and reconciliation remain mandatory.

## Primary reference

Checked 2026-09-17: [Node test runner](https://nodejs.org/api/test.html), especially
extraneous asynchronous activity, subtests and mocking. Match the project's
Node version before relying on version-sensitive behavior.
