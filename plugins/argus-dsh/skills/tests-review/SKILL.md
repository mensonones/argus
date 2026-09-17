---
name: tests-review
description: Review changed tests for ineffective assertions, unobserved asynchronous failures, misleading mocks and broken isolation. Load when acting as argus_tests or reviewing test reliability; not for generic requests to add coverage.
---

# Tests Review

> **DSH host.** This skill runs on the DeepSeek Harness. Argus is reached
> through MCP, so every Argus tool is namespaced `mcp__argus__<tool>`
> (for example `mcp__argus__argus_init`). The specialist reviewers and
> the adversary are model-facing tools that carry their own reviewer persona:
> `argus_architecture`, `argus_challenger`, `argus_correctness`, `argus_performance`, `argus_security`, `argus_tests`. Call them as tools —
> they replace the named subagents of the other hosts and inherit the Argus
> skills and MCP tools.

Review whether assigned tests detect the behavior they claim to protect. Read
the changed test, exercised implementation and local runner setup. Distinguish
a defect in the test from a production defect witnessed by a test.

## Finding criteria

- Assertions accept a concrete wrong result: self-comparison, discarded results,
  empty inputs skipping the branch, or mocks supplying the result being verified.
- Async assertions or rejections are not awaited/returned, allowing the runner
  to finish without observing failure. Establish the actual runner contract.
- Fixtures or mocks bypass the relevant path. Identify the reachable regression
  the test would silently accept, not merely the use of mocks.
- Shared state or missing cleanup causes demonstrated order-dependent failures;
  nondeterminism needs evidence. Slowness alone is not flakiness.
- A weakened assertion or skipped branch loses an established contract. Name
  the exact incorrect behavior now accepted, not a generic coverage gap.

## Evidence and boundaries

When practical, use an isolated probe with a deliberately wrong result or
targeted mutation and a control. Do not modify reviewed files to obtain evidence.
Separate executed observations from static reasoning and disclose unavailable
runners/dependencies. Do not report missing tests alone, coverage percentages,
mock counts, naming, snapshot use or preferred testing styles. Do not claim an
untested production path is broken without proving it.

Query similar findings first. Record candidates with `reviewer: tests`,
`category: tests`, location at the defective test/setup, accepted wrong behavior
and its consequence for test reliability. Existing production findings are
witnesses of that cause, not new tests defects unless the test has an independent
failure. Every candidate needs Challenger validation and explicit reconciliation.
Record nothing if no concrete defect is established.
