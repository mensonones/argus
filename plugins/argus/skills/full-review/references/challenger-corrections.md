# Root causes and claim corrections

`argus_record_finding` accepts an optional `rootCause` with `symbol`, `mechanism`
and `invariant`, all nonempty strings. This is a proposal until the Challenger
validates it. `argus_record_challenge` accepts the same structure and can replace
the proposed root cause. Before validating, inspect the existing candidates and
reuse the exact triple for an already established defect in the same file.

Example: `{"symbol":"updateAccount","mechanism":"missing-owner-check",
"invariant":"only-owner-may-update"}`. Different wording or categories are not
new causes. Do not use line proximity as proof. Conversely, a missing storage
method and excessive round trips violate different invariants and can remain
separate findings if independently substantiated.

Current-round consolidation requires `argus_reconcile`: the coordinator supplies
canonical/member IDs, reviewed member categories, a root cause, reasoning and
`claims_reviewed: true`. All survivors must be covered once, including singleton
groups; use `[]` for no survivors. Matching root prose alone no longer merges
current findings automatically. Legacy title/root heuristics remain only for
historical baseline matching. The runtime does not certify semantic equivalence.

If a candidate has a real core defect but unsupported additional claims, send
`correction` on `argus_record_challenge` with CONFIRMED or PLAUSIBLE:

```json
{
  "reason": "The sequential loop preserves order; removed the unsupported ordering claim.",
  "title": "loadAccounts exceeds the one-round-trip contract",
  "description": "The loop performs one sequential storage call per ID instead of one batch.",
  "evidence": ["For N IDs the loop invokes storage.get N times; the contract permits at most one call."],
  "impact": "Bulk loads incur N sequential round trips instead of one.",
  "scenario": "100 IDs cause 100 calls instead of one.",
  "recommendation": "Restore storage.getMany(ids).",
  "severity": "medium",
  "confidence": "high"
}
```

This replaces all claim-bearing text: title, description, evidence and impact
are required; omitted/null scenario and recommendation are cleared. Severity
and confidence remain unchanged unless supplied. Identity, location, category
and reviewer cannot be edited. If a packet already exists, supply a replacement
`evidencePackage` too, removing the unsupported claims throughout observations,
controls and limitations. Never describe an inferred result as an executed test.

Every correction records its reason and previous content in SQLite/JSON.
Readable reports show revised content and correction reasons, not the removed
claims. Reconciliation uses the chosen canonical content and does not union
old duplicate evidence or restore a superseded severity. Invalid core claims
are REJECTED without a correction. Correcting a true claim is not suppression.
