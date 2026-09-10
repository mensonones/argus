---
name: correctness-review
description: Heuristics and a checklist for the Argus Correctness Reviewer — finding logic bugs, bad edge cases, null/undefined mishandling, exception-handling gaps, concurrency/state-consistency bugs, and incorrect API usage. Load when reviewing changed code for bugs, or when acting as argus-correctness.
---

# Correctness Review Heuristics

Find real bugs. Trace the actual control and data flow — do not pattern-match.

## Checklist

- **Conditions & logic.** Off-by-one, inverted comparisons, `&&`/`||` mix-ups,
  wrong operator precedence, unreachable or always-true branches.
- **Null/undefined.** Access before a guard; optional chaining hiding a real
  missing value; default that masks an error; `==` vs `===` coercion surprises.
- **Edge cases.** Empty collections, zero/negative numbers, boundary indices,
  very large inputs, unicode, timezone/DST, integer overflow, float equality.
- **Error handling.** Swallowed exceptions (empty `catch`), errors logged but not
  handled, missing rollback on failure, `await` missing on a promise, unhandled
  rejection, resource not released on the error path.
- **State consistency.** Local state mutated before a fallible operation (classic:
  decrement balance, then call transfer that may throw); partial updates; cache
  updated but source not (or vice versa); stale reads.
- **Concurrency.** Shared mutable state without synchronization; check-then-act
  races (TOCTOU); non-idempotent retries; missing idempotency key; assuming
  ordering across async calls.
- **API misuse.** Wrong argument order, ignored return value/error code, misusing
  a library contract, incorrect lifecycle (use-after-free/close).
- **Regressions.** The change alters behaviour a caller or test relied on.

## Confirming a bug

Read callers and callees to prove the path is reachable and the failure is real.
State the exact triggering scenario. If you cannot construct a concrete failing
input/sequence, it is at best low confidence. Record with `argus_record_finding`
(`reviewer: correctness`), putting the exact code and call chain in `evidence`
and the triggering sequence in `scenario`.
