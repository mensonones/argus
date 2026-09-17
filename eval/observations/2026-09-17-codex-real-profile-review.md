# Codex real profile review — adjudication with unresolved release gates

This is an unscored, post-review observation, not blinded evaluation or evidence
of general production effectiveness. Adjudication applies the Challenger gates
and causal-independence procedure. Reviewed application sources, original Argus
round/database/report and raw host logs were not changed. No application or
backend execution was performed during this adjudication.

## Artifacts and scope

- Argus: 0.3.0-alpha.6, Codex cachebuster 20260917123315.
- Application: local 3rn-mobile checkout, React Native/React/Expo, TypeScript.
- Reviewed HEAD: 44268d50cb72928424402e90201335f14bcf9d8a.
- Merge parents: dcfae41cbef7c20bf1b780429e6f280af40fcd5a and
  5bf5280057d0d2bb98b31fdcb2ad483dc43b01f4.
- Current merge-base against origin/main is the second parent above. Its direct
  diff to reviewed HEAD contains 33 changed paths, matching the report inventory.
- Eight non-merge branch commits are listed: ac70345, b918cb7, e30d809,
  97fdec8, 0974967, f82944b, d6690d7 and dcfae41.
- Round: 51790818-6d88-4e51-81c2-555f1d6ffe27. Original report basename:
  report-51790818-6d88-4e51-81c2-555f1d6ffe27.md.
- User-supplied host transcript and local coordinator/child rollout metadata
  were inspected. Host session source is recorded as vscode; build/model and
  reasoning setting were not established here. Transcript duration: 15:29.

The observed operation is an integrated-tree diff against the merge-base, not
eight individually reviewed commit patches. Listing non-merge commits does not
exclude merge resolution changes from an endpoint diff. The merge imported
upstream changes relative to its first parent; those upstream-only changes are
not automatically part of the diff against the second parent. No evidence here
establishes that upstream-only changes contaminated the account-closure finding:
the reviewed account-confirm/success files are unchanged by this final merge
relative to its first parent. The categorical statement "merge excluded" still
needs qualification or explicit per-commit patch selection/attribution.

At adjudication, git status shows only untracked .argus/. This can explain a
dirty checkout without inclusion of uncommitted sources. The transcript says
includeWorkingTree=false; dirty metadata alone does not disprove it. Historical
tracked cleanliness was not independently certified. Snapshot HEAD is legitimately
the merge commit when inspecting its integrated tree, even if it is not in the
non-merge commit list.

## Delegation and provenance

Four specialist children and a Challenger child are visible in the transcript.
Candidates were retained with IDs 9520c932-16f9-4c64-a3d7-27203cadee8c and
f1ebd3c9-9611-457d-a151-8be3d5ddebf0. No reconstruction or context failure is
reported in this run; this is not an independent audit of every database write.

The raw host dispatch output and child session metadata establish:

- Coordinator ID: 01a0b098-4e5c-7b30-8229-1b15477b9527.
- Challenger child ID: 01a0b09e-a8fb-7663-ae40-88d9ed4fc1fc, nickname Dewey,
  depth 1, with the coordinator above as parent.
- The final report instead records the coordinator ID as delegated agentId.
  Its claim that CODEX_SESSION_ID supplies the child's dispatched ID is false
  for this observed run. The child really existed; the stored attribution is wrong.

Therefore real delegation is observed, but the pre-report provenance requirement
was not met. Do not treat this run as passing the provenance gate or relabel
the original record silently. The dispatch prompt still used an ID placeholder;
the actual returned child ID must be supplied explicitly after dispatch and
compared with every stored verdict before reporting. An environment session ID
must not substitute for that comparison.

## Candidate adjudication

### A. Success-screen CTA has a no-op handler

Static fact confirmed: CloseAccountSuccessScreen renders the labeled button with
onPress={() => undefined}. The branch reaches it after result.ok of the close
request. There is no native-app reproduction here; system back/gestures, exit
policies and platform behavior are not established. HIGH severity is not
independently endorsed by this observation.

Crucially, the same no-op button exists at the pinned base 5bf5280, and
CloseAccountSuccess/index.tsx is not a changed path in the 33-file diff. The base
confirmation screen already navigated to this success route without a backend
call. Commit dcfae41 adds the real close request, not the no-op button.

Disposition: real pre-existing UI defect / related-flow context, not a proven
new regression introduced by the reviewed branch. If reported because the
integration newly performs a real closure, disclose that contextual rationale
and the pre-existing behavior. Baseline NEW denotes history identity, not Git
introduction. Do not count it as a newly introduced defect without attribution.

### B. Successful real closure does not clear local session credentials

Static fact confirmed in the changed success branch: handleClose calls
useCloseAccount.mutateAsync and then only router.replace. The hook performs the
authenticated POST and does not clear storage; the success screen has no cleanup.
clearAuthSession deletes access/refresh token keys, clientCode, expiration and
biometric configuration. Existing logout and refresh-failure paths call it;
apiRequest returns successful responses before its unauthorized/refresh cleanup.

Thus local credential retention after successful closure is supported. It is
not proof that retained tokens can authorize further backend operations or that
an attacker can exploit them. The checked API contract blocks login/refresh for
CLOSED accounts; the application's sensitive-data policy supports discarding
unneeded session material. Native SecureStore contents, backend invalidation,
and Redux/router lifecycle were not dynamically tested.

Disposition: supported integration omission, with bounded local-retention impact.
Security severity remains subject to threat-model/product adjudication; no fraud,
continued backend access or financial-loss claim is accepted. The Challenger's
correction successfully removed those unsupported reachability claims.

### C. Consolidation is not justified by the observed code

Static counterfactuals (not executed patches):

1. Adding clearAuthSession to the successful close branch removes local retention
   while leaving the success button's no-op handler untouched.
2. Connecting that button to a UI navigation action without clearing storage
   makes the CTA functional while credential retention remains.

Both changes correspond to available responsibilities in the inspected code;
they require no hypothetical backend. "Complete the flow" combines distinct
omissions rather than establishing one concrete causal mechanism. Prefer separate
cause-level treatment if both are in scope, explicitly marking A as pre-existing.
For a strict introduced-regressions-only review, retain B and record A as context.
This is not rejection of a valid duplicate solely to reduce the count.

The selected canonical description/evidence/impact only substantiate the CTA;
rootCause/reconciliation nevertheless claim to preserve credential retention.
This fails canonical claim coverage. If a future adjudication favors one combined
finding, its actual canonical content and packet must retain evidence and impact
for both validated consequences before reconciliation, not merely mention them
in grouping reasoning or recommendations.

## What this run demonstrates and what it does not

- Positive: visible specialist/Challenger delegation, real repository inspection,
  two evidence-backed observations and Challenger correction of exaggerated claims.
- Transcript reports passing typecheck/lint and 72 suites/327 tests; these checks
  were not rerun or independently certified here. Passing existing tests does
  not reproduce either account-closure behavior.
- Negative: final delegated ID is wrong; consolidation/claim coverage are not
  accepted; introduced-change scope needs qualification. No precision/recall/F1
  is computed from this observation, and one final finding is not ground truth.
- This is one real diff, not completion of the six-diff corpus, four-host matrix
  or repeated-baseline gates in ROADMAP.md. It is not a passing RC qualification.

## Next verification, before release qualification

1. Preserve this original round and publish adjudication separately, as done here.
2. Supply Momo's actual dispatch ID explicitly; verify stored provenance while
   active, before reconcile/report. Diagnose why existing alpha.6 instructions
   were bypassed; do not claim a runtime-certified gate exists merely from prose.
3. Define review scope as pinned integrated diff or explicitly selected commit
   patches; never equate --no-merges enumeration with filtering an endpoint diff.
4. Review consolidation against code-level counterfactuals and require explicit
   canonical coverage of retained consequences; decide pre-existing issue policy.
5. After any authorized Argus changes/reinstall, repeat against the same pinned
   base/HEAD with application unchanged. Match historical combined identity
   cautiously: one old identity cannot serve as primary for two distinct groups.
   Record the split/coverage transition rather than forcing both persistent.

This note documents evidence and a proposed adjudication policy. It does not
modify runtime behavior, canonical history, pilot labels or application code.
