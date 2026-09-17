---
name: architecture-review
description: Heuristics and a checklist for the Argus Architecture Reviewer — coupling, circular dependencies, broken layer boundaries, misplaced responsibilities, leaky abstractions, and structural duplication. Emphasizes separating taste from concrete defects. Load when reviewing changed code for structure, or when acting as argus_architecture.
---

# Architecture Review Heuristics

> **DSH host.** This skill runs on the DeepSeek Harness. Argus is reached
> through MCP, so every Argus tool is namespaced `mcp__argus__<tool>`
> (for example `mcp__argus__argus_init`). The specialist reviewers and
> the adversary are model-facing tools that carry their own reviewer persona:
> `argus_architecture`, `argus_challenger`, `argus_correctness`, `argus_performance`, `argus_security`, `argus_tests`. Call them as tools —
> they replace the named subagents of the other hosts and inherit the Argus
> skills and MCP tools.

Report concrete structural defects, never taste. For every candidate, name the
tangible consequence: what becomes hard to **change, test, deploy, or reason
about**.

## Checklist

- **Layer boundaries.** Domain/business logic importing infrastructure (DB, HTTP,
  framework) directly; a controller with business rules; a service doing a
  repository's raw data access; UI reaching into persistence.
- **Coupling.** A change here forces edits across many unrelated modules; a module
  reaching into another's internals; shared mutable global state.
- **Circular dependencies.** A ↔ B import cycles (module, package, or service).
- **Responsibility.** One unit doing several unrelated jobs (a "god" class/file);
  a function whose name no longer matches what it does; mixed levels of abstraction.
- **Abstractions.** An interface with a single implementation added "just in
  case"; a wrapper that only forwards; premature generalization; a leaky
  abstraction that exposes what it should hide.
- **Duplication (structural).** The same structural decision copied in a way that
  will drift out of sync (not mere textual repetition a helper would fix).
- **Project rules.** If `argus.yaml` declares architecture rules (e.g. "domain
  must not depend on infrastructure"), check the change against them.

## The taste test

Ask: "If a competent engineer disagreed, would this still be a defect?" If it is
only "I'd do it differently", drop it. If it creates a concrete future cost,
record it with `mcp__argus__argus_record_finding` (`reviewer: architecture`), naming the
structural relationship in `evidence` and the concrete cost in `impact`.
