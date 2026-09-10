---
name: architecture-review
description: Heuristics and a checklist for the Argus Architecture Reviewer — coupling, circular dependencies, broken layer boundaries, misplaced responsibilities, leaky abstractions, and structural duplication. Emphasizes separating taste from concrete defects. Load when reviewing changed code for structure, or when acting as argus-architecture.
---

# Architecture Review Heuristics

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
record it with `argus_record_finding` (`reviewer: architecture`), naming the
structural relationship in `evidence` and the concrete cost in `impact`.
