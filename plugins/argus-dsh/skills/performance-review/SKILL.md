---
name: performance-review
description: Heuristics and a checklist for the Argus Performance Reviewer — N+1 queries, loops over large inputs, repeated network/IO, excessive allocation, poor algorithmic complexity, and blocking calls on hot paths. Load when reviewing changed code for performance, or when acting as argus_performance.
---

# Performance Review Heuristics

> **DSH host.** This skill runs on the DeepSeek Harness. Argus is reached
> through MCP, so every Argus tool is namespaced `mcp__argus__<tool>`
> (for example `mcp__argus__argus_init`). The specialist reviewers and
> the adversary are model-facing tools that carry their own reviewer persona:
> `argus_architecture`, `argus_challenger`, `argus_correctness`, `argus_performance`, `argus_security`. Call them as tools —
> they replace the named subagents of the other hosts and inherit the Argus
> skills and MCP tools.

Report only what a real workload would feel. Quantify the cost. Skip
micro-optimizations.

## Checklist

- **N+1 queries.** A query (or remote call) inside a loop over a collection whose
  size grows with data/users. Look for `.map`/`for` around a DB/ORM/`fetch` call.
  This is the highest-value class — hunt it first.
- **Loops.** Nested loops over large N (accidental O(n²)); repeated linear scans
  that could be a map/set lookup; recomputation inside a loop that is loop-invariant.
- **Repeated IO/network.** The same value fetched/read multiple times instead of
  once; missing batching; a call in a render path.
- **Allocation.** Large intermediate arrays/strings; copying big structures in a
  hot path; building then discarding; unbounded caches/leaks.
- **Algorithmic complexity.** Wrong data structure (array where a set/map fits);
  sorting when a single pass would do; quadratic string building.
- **Blocking.** Synchronous IO/CPU on an event loop or request path; missing
  pagination/streaming for large results; unbounded concurrency.
- **UI (if applicable).** Re-render on every keystroke, work in render instead of
  memoized, large lists without virtualization.

## Before recording

Estimate the concrete cost: what is N, is this on a hot path, how often does it
run? Constant, small, off-hot-path work is not a finding. Record with
`mcp__argus__argus_record_finding` (`reviewer: performance`), putting the cost analysis in
`evidence` and the degradation condition in `impact`.
