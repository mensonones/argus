# Root causes and claim corrections

`argus_record_finding` accepts an optional `rootCause` with `symbol`, `mechanism`
and `invariant`, all nonempty strings. This is a proposal until the Challenger
validates it. `argus_record_challenge` accepts the same structure and can replace
the proposed root cause. Before validating, inspect the existing candidates and
reuse the exact triple for an already established defect in the same file.

Example: `{"symbol":"updateAccount","mechanism":"missing-owner-check",
"invariant":"only-owner-may-update"}`. Different wording or categories are not
new causes. Do not use line proximity as proof. Different invariant labels are
also not proof that two defects are independent.

## Deciding whether findings are independent

The coordinator adjudicates using inspected code, contracts and observations,
not a majority vote among Challengers. Reviewer agreement and examples in these
instructions are not evidence and cannot resolve a factual disagreement.

For each proposed split, identify the triggering preconditions, violated
contract and observable consequence. Use a targeted counterfactual or control
when practical: explain whether one claimed failure can remain after the other
is removed or prevented, without inventing unsupported caller/adapter behaviour.
Record executed observations separately from static reasoning and limitations.
Different inputs alone are not independence; neither different lenses/invariant
names nor the same fix decide the grouping. A single cause may have multiple
verified consequences best retained in one canonical finding.

If Challengers disagree, inspect the disputed assumption and record the
coordinator's evidence-based rationale. Do not settle by vote or by citing this
guide as authority. If independence remains uncertain, disclose it in the
reconciliation reasoning; do not claim a proven separate defect. Preserve the
verified consequences in coherent canonical content when consolidating.

For example, an undeclared collaborator member and repeated IO might be
independent failures, or facets of one API regression. Neither merge nor split
is prescribed: establish the actual adapter contract, reachable nonempty path,
and causal relationship from evidence in that repository. Parallelizing calls
alone does not settle independence from a batching contract.

Current-round consolidation requires `argus_reconcile`: the coordinator supplies
canonical/member IDs, reviewed member categories, a root cause, reasoning and
`claims_reviewed: true`. All survivors must be covered once, including singleton
groups; use `[]` for no survivors. Matching root prose alone no longer merges
current findings automatically. Legacy title/root heuristics remain only for
historical baseline matching. The runtime does not certify semantic equivalence.

Historical baseline identity is independent of current canonical IDs. Inspect
`argus_baseline_findings`, then optionally include `baseline_match` with an existing
historical `finding_id` and a justified `reasoning` in reconciliation. This
propagates `baselineIdentity` across rewording/category changes. Unknown or
cross-file IDs and reuse of one identity for multiple current defects fail.
Do not link distinct invariants merely because they share lines. Conflicting
validated causes block automatic title-based matching; explicit links require
reviewed semantic equivalence. Uncertain old entries remain not redetected,
never verified fixed. History stores canonical groups before filtering/suppression.

## Incorporating historical findings

New multi-member groups require `causal_analysis` and `claim_coverage`. Assess
concrete independent-prevention counterfactuals, not a broad "finish the flow"
cause. Each retained consequence needs member `finding_id`, `source_claim`
quoting its current description/evidence/impact, and exact canonical
`description_excerpt`, `evidence_excerpt`, `impact_excerpt`; if a packet exists,
also quote its `observed` as `observation_excerpt`. Correct canonical content
first. Runtime checks excerpts and member references, not semantic truth or
completeness. Historical groups remain readable, not retroactively certified.

If canonical content now covers a consequence previously reported separately,
keep `baseline_match` for its primary identity and add `incorporated_baselines`:
`[{"finding_id":"historical-facet-id","reasoning":"why this consequence is covered, not fixed","covered_claims":["specific verified consequence retained in canonical content"]}]`.
Inspect the historical evidence and validate the current consequence first;
correct canonical text/packet before recording the relationship. Never use this
as suppression, as a replacement for an ordinary same-defect baseline match,
or to hide an unvalidated/removed claim. Unknown/current/cross-file IDs and
reuse of an incorporated identity as another primary or incorporation fail.

Reports distinguish incorporated historical findings from not-redetected or
fixed findings, including when the destination is filtered/suppressed. The
original snapshot and identities remain unchanged. Reassert incorporation only
when the consequence is verified in the current round; links are not silently
inherited as evidence. History exposes old links for inspection. The runtime
validates identity constraints, not the truth or completeness of covered_claims.

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
