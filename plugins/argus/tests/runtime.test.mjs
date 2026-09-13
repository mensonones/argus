import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { loadConfig } from "../dist/config.js";
import { ARGUS_VERSION } from "../dist/version.js";
import { GlobalMemory, Memory } from "../dist/db.js";
import { deduplicate, scoreFinding } from "../dist/dedup.js";
import { buildDiff } from "../dist/git.js";
import {
  initReview,
  importBaseline,
  listSuppressions,
  recordChallenge,
  recordFinding,
  recordReviewerRun,
  report,
  reconcileFindings,
  listFindings,
  listBaselineFindings,
  suppressFinding,
} from "../dist/service.js";

function reconcileSingles(cwd) {
  reconcileFindings(cwd, listFindings(cwd).filter(f => f.status === "confirmed").map(f => ({
    canonical_id: f.id, members: [{ finding_id: f.id, category: f.category }],
    rootCause: f.rootCause ?? { symbol: f.file, mechanism: f.title, invariant: f.impact },
    reasoning: "Test fixture: one independently validated defect.", claims_reviewed: true,
  })));
}

test("incorporation covers an old facet without marking it missing or fixed and preserves history", async () => {
  const cwd = repo(); await initReview({ cwd });
  const costCause = { symbol: "loadAccounts", mechanism: "per-id-io", invariant: "one-trip" };
  const portCause = { symbol: "loadAccounts", mechanism: "undeclared-get", invariant: "declared-storage-surface" };
  const original = [costCause, portCause].map((rootCause, i) => {
    const id = recordFinding(cwd, finding({ title: `loadAccounts facet ${i}`, rootCause })).id;
    recordChallenge(cwd, id, "CONFIRMED", "Fixture witness", undefined, undefined, rootCause);
    return id;
  });
  reconcileSingles(cwd); report({ cwd, write: false, promoteGlobal: false });
  await initReview({ cwd });
  const before = listBaselineFindings(cwd).previous;
  const id = recordFinding(cwd, finding({ title: "loadAccounts API regression", rootCause: costCause,
    evidence: ["N calls with a both-methods adapter; getMany-only adapter throws on nonempty input"],
    description: "Batch operation replaced by individual calls; includes conditional interface failure." })).id;
  recordChallenge(cwd, id, "CONFIRMED", "Both consequences preserved", undefined, undefined, costCause);
  const link = { finding_id: original[1], reasoning: "Maintainer-approved grouping: interface symptom remains in canonical content, not fixed.",
    covered_claims: ["Nonempty getMany-only adapter throws TypeError because get is missing."] };
  const group = { canonical_id: id, members: [{ finding_id: id, category: "performance" }], rootCause: costCause,
    reasoning: "One API regression with two retained consequences", claims_reviewed: true,
    baseline_match: { finding_id: original[0], reasoning: "Same round-trip defect" }, incorporated_baselines: [link] };
  for (const bad of ["unknown", id, original[0]]) {
    assert.throws(() => reconcileFindings(cwd, [{ ...group, incorporated_baselines: [{ ...link, finding_id: bad }] }]));
  }
  assert.throws(() => reconcileFindings(cwd, [{ ...group, incorporated_baselines: [link, link] }]), /incorporated identity/);
  const other = recordFinding(cwd, finding({ rootCause: portCause })).id;
  recordChallenge(cwd, other, "CONFIRMED", "Separate current facet fixture", undefined, undefined, portCause);
  const otherGroup = { canonical_id: other, members: [{ finding_id: other, category: "correctness" }],
    rootCause: portCause, reasoning: "Separate primary fixture", claims_reviewed: true,
    baseline_match: { finding_id: original[1], reasoning: "Same port facet" } };
  assert.throws(() => reconcileFindings(cwd, [group, otherGroup]), /incorporated identity/);
  recordChallenge(cwd, other, "REJECTED", "Fixture removed before valid consolidation");
  for (const invalid of [{ ...link, reasoning: " " }, { ...link, covered_claims: [] }]) {
    assert.throws(() => reconcileFindings(cwd, [{ ...group, incorporated_baselines: [invalid] }]));
  }
  reconcileFindings(cwd, [group]);
  const out = report({ cwd, format: "json", minSeverity: "critical", write: false, promoteGlobal: false });
  assert.equal(out.result.findings.length, 0); // Filtering does not erase the canonical link.
  assert.equal(out.result.incorporatedBaselineCount, 1);
  assert.equal(out.result.unmatchedPreviousCount, 0);
  assert.equal(out.result.resolvedCount, 0);
  assert.equal(out.result.incorporatedBaselineFindings[0].intoFindingId, id);
  assert.deepEqual(JSON.parse(out.rendered).incorporatedBaselineFindings[0].coveredClaims, link.covered_claims);
  const history = listBaselineFindings(cwd);
  assert.deepEqual(history.previous, before); // Original two-finding snapshot is untouched.
  assert.match(report({ cwd, format: "markdown", write: false, promoteGlobal: false }).rendered, /Historical findings incorporated — not fixed/);
  assert.match(report({ cwd, format: "terminal", write: false, promoteGlobal: false }).rendered, /incorporated — not fixed/);
  await initReview({ cwd });
  const canonical = listBaselineFindings(cwd).previous[0];
  assert.equal(canonical.baselineIncorporations[0].findingId, original[1]);
  assert.equal(canonical.baselineIdentity, original[0]);
  const next = recordFinding(cwd, finding({ rootCause: costCause })).id;
  recordChallenge(cwd, next, "CONFIRMED", "Current primary defect verified", undefined, undefined, costCause);
  reconcileSingles(cwd);
  const result = report({ cwd, write: false, promoteGlobal: false }).result;
  assert.equal(result.findings[0].baselineStatus, "persistent");
  assert.equal(result.incorporatedBaselineCount, 0); // Never silently claim the old symptom was revalidated.
});

test("incorporation refuses cross-file references", async () => {
  const cwd = repo(); await initReview({ cwd });
  const a = recordFinding(cwd, finding({ file: "a.js" })).id;
  const b = recordFinding(cwd, finding({ file: "b.js" })).id;
  [a, b].forEach(id => recordChallenge(cwd, id, "CONFIRMED", "Verified"));
  reconcileSingles(cwd); report({ cwd, write: false, promoteGlobal: false });
  await initReview({ cwd });
  const id = recordFinding(cwd, finding({ file: "a.js" })).id;
  recordChallenge(cwd, id, "CONFIRMED", "Verified");
  const group = { canonical_id: id, members: [{ finding_id: id, category: "security" }], rootCause: ownerCause,
    reasoning: "Fixture", claims_reviewed: true, incorporated_baselines: [{ finding_id: b, reasoning: "Fixture", covered_claims: ["claim"] }] };
  assert.throws(() => reconcileFindings(cwd, [group]), /same file/);
});

test("canonical history and explicit links preserve three identities across changed prose and lenses", async () => {
  const cwd = repo(); await initReview({ cwd });
  const pairs = [0, 1, 2].map(i => [0, 1].map(j => recordFinding(cwd, finding({ title: `first-${i}-${j}` })).id));
  for (const id of pairs.flat()) recordChallenge(cwd, id, "CONFIRMED", "Verified");
  const groups = pairs.map((ids, i) => ({ canonical_id: ids[0], members: ids.map(id => ({ finding_id: id, category: "security" })),
    rootCause: { ...ownerCause, symbol: `function-${i}` }, reasoning: "Same defect per pair", claims_reviewed: true }));
  reconcileFindings(cwd, groups);
  const first = report({ cwd, write: false, promoteGlobal: false }).result.findings;
  for (let round = 0; round < 2; round++) {
    await initReview({ cwd });
    const previous = listBaselineFindings(cwd).previous;
    assert.equal(previous.length, 3); // Not six raw cross-lens candidates.
    const nextGroups = previous.map((old, i) => {
      const id = recordFinding(cwd, finding({ title: `unrelated-title-${round}-${i}`, category: "performance" })).id;
      recordChallenge(cwd, id, "CONFIRMED", "Same defect witnessed again");
      return { canonical_id: id, members: [{ finding_id: id, category: "performance" }],
        rootCause: { symbol: `function-${i}`, mechanism: `new-wording-${round}`, invariant: `rephrased-${i}` },
        reasoning: "Single current defect", claims_reviewed: true,
        baseline_match: { finding_id: old.id, reasoning: "Inspected old and current evidence: same operation and violated contract, only wording/lens changed." } };
    });
    assert.throws(() => reconcileFindings(cwd, [{ ...nextGroups[0], baseline_match: { finding_id: "unknown", reasoning: "Fixture" } }, ...nextGroups.slice(1)]), /existing historical/);
    assert.throws(() => reconcileFindings(cwd, nextGroups.map(g => ({ ...g, baseline_match: nextGroups[0].baseline_match }))), /same baseline identity/);
    reconcileFindings(cwd, nextGroups);
    const result = report({ cwd, format: "json", write: false, promoteGlobal: false }).result;
    assert.equal(result.unmatchedPreviousCount, 0);
    assert.deepEqual(result.findings.map(f => f.baselineStatus), ["persistent", "persistent", "persistent"]);
    assert.deepEqual(result.findings.map(f => f.baselineIdentity).sort(), first.map(f => f.baselineIdentity).sort());
    assert.ok(result.findings.every(f => f.baselineMatch.reasoning));
  }
});

test("distinct validated causes on identical lines and titles never auto-match the baseline", async () => {
  const cwd = repo(); await initReview({ cwd });
  const id = recordFinding(cwd, finding({ rootCause: ownerCause })).id;
  recordChallenge(cwd, id, "CONFIRMED", "Verified", undefined, undefined, ownerCause);
  reconcileSingles(cwd); report({ cwd, write: false, promoteGlobal: false });
  await initReview({ cwd });
  const different = { ...ownerCause, invariant: "separate-independent-invariant" };
  const next = recordFinding(cwd, finding({ rootCause: different })).id;
  recordChallenge(cwd, next, "CONFIRMED", "Independent defect", undefined, undefined, different);
  reconcileSingles(cwd);
  const result = report({ cwd, write: false, promoteGlobal: false }).result;
  assert.equal(result.findings[0].baselineStatus, "new");
  assert.equal(result.unmatchedPreviousCount, 1);
});

test("legacy reconciled rounds recover canonical groups without a stored snapshot", async () => {
  const cwd = repo(); await initReview({ cwd });
  const ids = [0, 1].map(i => recordFinding(cwd, finding({ title: `legacy-${i}` })).id);
  ids.forEach(id => recordChallenge(cwd, id, "CONFIRMED", "Verified"));
  reconcileFindings(cwd, [{ canonical_id: ids[0], members: ids.map(id => ({ finding_id: id, category: "security" })),
    rootCause: ownerCause, reasoning: "Same old defect", claims_reviewed: true }]);
  const mem = Memory.open(cwd);
  mem.setRoundStatus(mem.activeRound().id, "reported"); mem.close();
  await initReview({ cwd });
  assert.equal(listBaselineFindings(cwd).previous.length, 1);
  assert.deepEqual(listBaselineFindings(cwd).previous[0].consolidation.memberIds, ids);
});

test("filtered and suppressed canonical history survives, and explicit older links classify regressions", async () => {
  const cwd = repo(); await initReview({ cwd });
  const ids = [0, 1, 2].map(i => recordFinding(cwd, finding({ title: `historical-${i}`, file: `file-${i}.js` })).id);
  ids.forEach(id => recordChallenge(cwd, id, "CONFIRMED", "Verified"));
  suppressFinding(cwd, ids[0], "Fixture accepted risk");
  reconcileSingles(cwd);
  assert.equal(report({ cwd, maxFindings: 1, write: false, promoteGlobal: false }).result.findings.length, 1);
  await initReview({ cwd });
  assert.equal(listBaselineFindings(cwd).previous.length, 3);
  reconcileFindings(cwd, []); report({ cwd, write: false, promoteGlobal: false });
  await initReview({ cwd });
  const id = recordFinding(cwd, finding({ file: "file-1.js", title: "Reworded older defect" })).id;
  recordChallenge(cwd, id, "CONFIRMED", "Verified again");
  const group = { canonical_id: id, members: [{ finding_id: id, category: "security" }], rootCause: ownerCause,
    reasoning: "Singleton", claims_reviewed: true, baseline_match: { finding_id: ids[1], reasoning: "Same older operation and broken invariant" } };
  assert.throws(() => reconcileFindings(cwd, [{ ...group, baseline_match: { ...group.baseline_match, finding_id: ids[0] } }]), /same file/);
  reconcileFindings(cwd, [group]);
  const result = report({ cwd, write: false, promoteGlobal: false }).result;
  assert.equal(result.findings[0].baselineStatus, "regression");
  assert.equal(result.findings[0].baselineIdentity, ids[1]);
});

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "argus-test-"));
}

test("categories are required and invalid values never fall back to correctness", async () => {
  const cwd = repo(); await initReview({ cwd });
  for (const category of [undefined, "Security", "unknown", ""]) {
    assert.throws(() => recordFinding(cwd, { ...finding(), category }));
  }
  for (const category of ["security", "performance"]) recordFinding(cwd, finding({ category }));
  assert.deepEqual(listFindings(cwd).map(f => f.category).sort(), ["performance", "security"]);
});

test("reconciliation is mandatory even for zero findings", async () => {
  const cwd = repo(); await initReview({ cwd });
  assert.throws(() => report({ cwd, write: false, promoteGlobal: false }), /argus_reconcile/);
  reconcileFindings(cwd, []);
  assert.equal(report({ cwd, write: false, promoteGlobal: false }).result.findings.length, 0);
});

test("explicit groups merge six cross-lens candidates into three and retain canonical claims", async () => {
  const cwd = repo(); await initReview({ cwd });
  const ids = Array.from({ length: 6 }, (_, i) => recordFinding(cwd, finding({
    title: `Independent prose ${i}`, category: "correctness", reviewer: i % 2 ? "security" : "correctness",
    impact: `Only canonical impact ${i}`, rootCause: { ...ownerCause, mechanism: `different-${i}` },
  })).id);
  for (const id of ids) recordChallenge(cwd, id, "CONFIRMED", "Test witness verified.");
  const groups = [0, 2, 4].map((i) => ({
    canonical_id: ids[i], members: [{ finding_id: ids[i], category: i === 4 ? "performance" : "security" },
      { finding_id: ids[i + 1], category: "correctness" }],
    rootCause: { ...ownerCause, symbol: `symbol-${i}` }, reasoning: "Same independently verified cause, not another defect.", claims_reviewed: true,
  }));
  assert.throws(() => report({ cwd, write: false, promoteGlobal: false }), /argus_reconcile/);
  assert.throws(() => reconcileFindings(cwd, groups.slice(1)), /every surviving/);
  assert.throws(() => reconcileFindings(cwd, [...groups, groups[0]]), /repeated/);
  assert.throws(() => reconcileFindings(cwd, [{ ...groups[0], canonical_id: "foreign-id" }, ...groups.slice(1)]), /Canonical/);
  assert.throws(() => reconcileFindings(cwd, [{ ...groups[0], claims_reviewed: false }, ...groups.slice(1)]));
  assert.deepEqual(reconcileFindings(cwd, groups), { groups: 3, duplicatesMerged: 3 });
  recordChallenge(cwd, ids[0], "PLAUSIBLE", "Updated confidence.");
  assert.throws(() => report({ cwd, write: false, promoteGlobal: false }), /changed after reconciliation/);
  reconcileFindings(cwd, groups);
  const result = report({ cwd, write: false, promoteGlobal: false }).result;
  assert.equal(result.findings.length, 3);
  assert.equal(result.duplicatesRemoved, 3);
  const first = result.findings.find(f => f.id === ids[0]);
  assert.equal(first.category, "security");
  assert.deepEqual(first.consolidation.memberIds, ids.slice(0, 2));
  assert.equal(first.impact, "Only canonical impact 0");
  assert.deepEqual(first.categories, ["security", "correctness"]);
  assert.equal(listFindings(cwd).length, 6);
});

test("reconciliation refuses pending, rejected and cross-file members", async () => {
  const cwd = repo(); await initReview({ cwd });
  const a = recordFinding(cwd, finding()).id;
  const b = recordFinding(cwd, finding({ file: "other.js" })).id;
  const group = { canonical_id: a, members: [{ finding_id: a, category: "security" }, { finding_id: b, category: "security" }],
    rootCause: ownerCause, reasoning: "Fixture", claims_reviewed: true };
  assert.throws(() => reconcileFindings(cwd, [group]), /Challenge all/);
  recordChallenge(cwd, a, "CONFIRMED", "Verified"); recordChallenge(cwd, b, "CONFIRMED", "Verified");
  assert.throws(() => reconcileFindings(cwd, [group]), /same file/);
  recordChallenge(cwd, b, "REJECTED", "Not reachable");
  assert.throws(() => reconcileFindings(cwd, [group]), /rejected/);
});

test("corrections and new findings invalidate reconciliation without restoring duplicate claims", async () => {
  const cwd = repo(); await initReview({ cwd });
  const id = recordFinding(cwd, finding({ evidencePackage: evidencePacket() })).id;
  recordChallenge(cwd, id, "CONFIRMED", "Verified");
  reconcileSingles(cwd);
  const correction = { reason: "Trim unsupported impact", title: "Verified narrow defect", description: "Narrow claim",
    evidence: ["Verified witness"], impact: "Only the verified consequence" };
  recordChallenge(cwd, id, "CONFIRMED", "Narrow claim verified", evidencePacket(), correction);
  assert.throws(() => report({ cwd, write: false, promoteGlobal: false }), /changed after reconciliation/);
  reconcileSingles(cwd);
  const other = recordFinding(cwd, finding()).id;
  assert.throws(() => report({ cwd, write: false, promoteGlobal: false }), /Challenger verdicts/);
  recordChallenge(cwd, other, "REJECTED", "Duplicate claim is unsupported");
  assert.throws(() => report({ cwd, write: false, promoteGlobal: false }), /changed after reconciliation/);
  reconcileSingles(cwd);
  const out = report({ cwd, format: "json", write: false, promoteGlobal: false });
  assert.equal(out.result.findings[0].impact, correction.impact);
  assert.equal(out.result.findings[0].corrections.length, 1);
  assert.equal(JSON.parse(out.rendered).unmatchedPreviousCount, 0);
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function repo() {
  const cwd = tempDir();
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "argus@example.test");
  git(cwd, "config", "user.name", "Argus Test");
  fs.writeFileSync(path.join(cwd, "app.js"), "export const value = 1;\n");
  git(cwd, "add", "app.js");
  git(cwd, "commit", "-qm", "initial");
  return cwd;
}

function finding(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    title: "Authorization bypass in account update",
    category: "security",
    severity: "high",
    confidence: "high",
    file: "app.js",
    lines: { start: 10, end: 12 },
    description: "Missing ownership check.",
    evidence: ["updateAccount(req.params.id)"],
    impact: "Another account can be changed.",
    reviewer: "security",
    status: "confirmed",
    challenge: { result: "CONFIRMED", reasoning: "No upstream guard." },
    ...overrides,
  };
}

function evidencePacket(overrides = {}) {
  return {schemaVersion:1,revision:"inspected-revision",workingTree:"dirty",
    method:"static-analysis",executionPath:["handler","write"],preconditions:["another owner"],
    expected:"deny",observed:"write allowed",limitations:["not executed"],...overrides};
}

test("evidence packet survives SQLite and Challenger update and appears in reports", async () => {
  const cwd = repo();
  await initReview({cwd});
  const {id} = recordFinding(cwd,{...finding(), evidencePackage:evidencePacket()});
  const packet = evidencePacket({method:"reproduction",command:"node test.js",artifact:"output: unauthorized write",negativeControl:{scenario:"owner write",observed:"allowed"}});
  assert.equal(recordChallenge(cwd,id,"CONFIRMED","Verified path",packet),true);
  const mem = Memory.open(cwd);
  assert.deepEqual(mem.getFinding(id).evidencePackage,packet);
  mem.close();
  reconcileSingles(cwd);
  const out = report({cwd,format:"markdown",write:false,promoteGlobal:false});
  assert.match(out.rendered,/reproduction \(reviewer-reported\)/);
  assert.match(out.rendered,/Negative control/);
  assert.deepEqual(out.result.findings[0].evidencePackage,packet);
});
test("invalid observations and blank verdict reasoning are rejected", async () => {
  const cwd = repo(); await initReview({cwd});
  assert.throws(()=>recordFinding(cwd,{...finding(),evidencePackage:evidencePacket({method:"test"})}),/Executed validation/);
  const {id} = recordFinding(cwd,finding());
  assert.throws(()=>recordChallenge(cwd,id,"CONFIRMED"," "),/non-empty/);
});
test("ranking is not inflated by repeated text or correlated reviewer agreement", () => {
  const base = finding();
  assert.equal(scoreFinding(base), scoreFinding({...base,evidence:Array(20).fill("same"),detectedBy:["a","b","c"]}));
  assert.ok(scoreFinding({...base,evidencePackage:evidencePacket()}) > scoreFinding(base));
});

const ownerCause = {symbol:"updateAccount",mechanism:"missing-owner-check",invariant:"only-owner-may-update"};
test("root causes consolidate actual lab titles across lenses without joining different invariants", () => {
  const a = finding({title:"updateAccount() missing owner check allows any user to mutate any account",category:"correctness",rootCause:ownerCause,rootCauseValidated:true});
  const b = finding({id:crypto.randomUUID(),title:"Missing ownership check in updateAccount enables IDOR/BOLA write to any account",rootCause:{...ownerCause},rootCauseValidated:true});
  const result = deduplicate([a,b]);
  assert.equal(result.findings.length,1);
  assert.equal(result.removed,1);
  assert.deepEqual(result.findings[0].categories.sort(),["correctness","security"]);
  const c = finding({id:crypto.randomUUID(),title:a.title,rootCause:{...ownerCause,invariant:"storage-interface-compatibility"},rootCauseValidated:true});
  assert.equal(deduplicate([a,c]).findings.length,2);
  assert.equal(deduplicate([{...a,rootCauseValidated:false},{...b,rootCauseValidated:false}]).findings.length,2);
});

test("Challenger correction removes unsupported claims and preserves original content atomically", async () => {
  const cwd = repo(); await initReview({cwd});
  const original = finding({impact:"Loses ordering and causes N calls",scenario:"Old scenario",recommendation:"Old fix"});
  const {id} = recordFinding(cwd,{...original,evidencePackage:evidencePacket(),rootCause:ownerCause});
  const correction = {reason:"Ordering is preserved; only repeated IO is proven",title:"Repeated storage calls",description:"One call per ID",evidence:["await storage.get inside loop"],impact:"N calls instead of one",severity:"medium"};
  assert.throws(()=>recordChallenge(cwd,id,"CONFIRMED","Core holds",undefined,correction),/replace the existing/);
  let mem = Memory.open(cwd);
  assert.equal(mem.getFinding(id).status,"candidate"); mem.close();
  recordChallenge(cwd,id,"CONFIRMED","Core holds",evidencePacket(),correction,ownerCause);
  mem = Memory.open(cwd); const revised = mem.getFinding(id); mem.close();
  assert.equal(revised.impact,correction.impact);
  assert.equal(revised.scenario,undefined);
  assert.equal(revised.recommendation,undefined);
  assert.equal(revised.severity,"medium");
  assert.equal(revised.rootCauseValidated,true);
  assert.equal(revised.corrections[0].original.impact,original.impact);
  reconcileSingles(cwd);
  const out = report({cwd,format:"markdown",write:false,promoteGlobal:false});
  assert.doesNotMatch(out.rendered,/Loses ordering|Old scenario|Old fix/);
  assert.match(out.rendered,/Challenger corrections/);
  assert.equal(out.result.findings[0].corrections[0].original.impact,original.impact);
});

test("consolidation does not reintroduce corrected evidence, severity or mismatched packets", () => {
  const original = finding({rootCause:ownerCause,rootCauseValidated:true,evidence:["unsupported ordering claim"],evidencePackage:evidencePacket({observed:"unsupported observation"})});
  const revised = finding({id:crypto.randomUUID(),rootCause:ownerCause,rootCauseValidated:true,severity:"medium",impact:"supported impact",evidence:["supported evidence"],evidencePackage:evidencePacket({observed:"supported observation"}),corrections:[{reason:"remove overstatement",original:{title:original.title,description:original.description,evidence:original.evidence,impact:original.impact,severity:original.severity,confidence:original.confidence}}]});
  for (const input of [[original,revised],[revised,original]]) {
    const result = deduplicate(input).findings[0];
    assert.equal(result.impact,"supported impact");
    assert.deepEqual(result.evidence,["supported evidence"]);
    assert.equal(result.evidencePackage.observed,"supported observation");
    assert.equal(result.severity,"medium");
  }
  const plausible = {...revised,challenge:{result:"PLAUSIBLE",reasoning:"narrowed claim remains uncertain"}};
  assert.deepEqual(deduplicate([original,plausible]).findings[0].evidence,["supported evidence"]);
  assert.equal(deduplicate([original,plausible]).findings[0].challenge.result,"PLAUSIBLE");
});

test("correction schema refuses partial edits, identity edits and rejected-core corrections", async () => {
  const cwd = repo(); await initReview({cwd}); const {id} = recordFinding(cwd,finding());
  const correction = {reason:"narrow impact",title:"Revised",description:"Revised description",evidence:["code"],impact:"Revised impact"};
  assert.throws(()=>recordChallenge(cwd,id,"CONFIRMED","holds",undefined,{reason:"partial"}));
  assert.throws(()=>recordChallenge(cwd,id,"CONFIRMED","holds",undefined,{...correction,file:"other.js"}));
  assert.throws(()=>recordChallenge(cwd,id,"REJECTED","invalid core",undefined,correction),/without a correction/);
  assert.equal(recordChallenge(cwd,"not-found","CONFIRMED","holds",undefined,correction),false);
});

test("invalid argus.yaml fails instead of silently using defaults", () => {
  const cwd = tempDir();
  fs.writeFileSync(path.join(cwd, "argus.yaml"), "severity:\n  minimum: medum\n");
  assert.throws(() => loadConfig(cwd), /Invalid Argus configuration/);
});

test("dedup keeps unrelated nearby findings separate", () => {
  const a = finding();
  const b = finding({
    id: crypto.randomUUID(),
    title: "Quadratic loop blocks account update",
    category: "performance",
    lines: { start: 11, end: 14 },
    reviewer: "performance",
  });
  const result = deduplicate([a, b]);
  assert.equal(result.removed, 0);
  assert.equal(result.findings.length, 2);
});

test("dedup consolidates the same cause and preserves multiple categories", () => {
  const a = finding();
  const b = finding({
    id: crypto.randomUUID(),
    title: "Authorization bypass during account update",
    category: "correctness",
    reviewer: "correctness",
  });
  const result = deduplicate([a, b]);
  assert.equal(result.removed, 1);
  assert.deepEqual(new Set(result.findings[0].categories), new Set(["security", "correctness"]));
});

test("default diff includes tracked and untracked working-tree changes", async () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "app.js"), "export const value = 2;\n");
  fs.writeFileSync(path.join(cwd, "new.js"), "export const added = true;\n");
  const diff = await buildDiff(cwd, { base: "main" });
  assert.deepEqual(new Set(diff.files.map((f) => f.path)), new Set(["app.js", "new.js"]));
  assert.match(diff.raw, /new\.js/);
});

test("renames are represented as reviewable delete/add paths", async () => {
  const cwd = repo();
  git(cwd, "mv", "app.js", "renamed.js");
  const diff = await buildDiff(cwd, { base: "main" });
  assert.deepEqual(new Set(diff.files.map((f) => f.path)), new Set(["app.js", "renamed.js"]));
});

test("report requires challenge and records reviewers with zero findings", async () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "app.js"), "export const value = 2;\n");
  await initReview({ cwd, base: "main" });
  recordReviewerRun(cwd, "security", "completed");
  recordReviewerRun(cwd, "correctness", "completed");
  const { id } = recordFinding(cwd, {
    reviewer: "correctness",
    category: "correctness",
    severity: "medium",
    confidence: "high",
    title: "Value update breaks the consumer contract",
    file: "app.js",
    start_line: 1,
    description: "The exported value changed incompatibly.",
    evidence: ["value changed from 1 to 2"],
    impact: "Existing consumer assertion fails.",
  });
  assert.throws(
    () => report({ cwd, write: false, promoteGlobal: false }),
    /still require Challenger verdicts/,
  );
  assert.equal(recordChallenge(cwd, id, "CONFIRMED", "Verified consumer contract."), true);
  reconcileSingles(cwd);
  const out = report({ cwd, write: false, promoteGlobal: false });
  assert.deepEqual(new Set(out.result.reviewersRun), new Set(["security", "correctness"]));
  assert.equal(out.result.findings.length, 1);
});

test("MCP init accepts an explicit target repository path", () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "app.js"), "export const value = 3;\n");
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "argus-test", version: "1" },
    } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: {
      name: "argus_init",
      arguments: { repo_path: cwd, base: "main" },
    } },
  ].map((message) => JSON.stringify(message)).join("\n") + "\n";
  const child = spawnSync(process.execPath, ["dist/bin/argus-mcp.js"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    input: messages,
    encoding: "utf8",
    timeout: 5_000,
  });
  assert.equal(child.status, 0, child.stderr);
  const inventory = child.stdout.split("\n").filter(Boolean).map(line => JSON.parse(line)).find(item => item.id === 3);
  assert.ok(inventory.result.tools.some(tool => tool.name === "argus_reconcile"));
  assert.ok(inventory.result.tools.some(tool => tool.name === "argus_baseline_findings"));
  assert.ok(inventory.result.tools.find(tool => tool.name === "argus_record_finding").inputSchema.required.includes("category"));
  const response = child.stdout.split("\n").filter(Boolean)
    .map((line) => JSON.parse(line)).find((item) => item.id === 2);
  assert.equal(response.result.isError, undefined);
  assert.match(response.result.content[0].text, new RegExp(cwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("global memory stores and retrieves confirmed findings", () => {
  const previousHome = process.env.HOME;
  process.env.HOME = tempDir();
  try {
    const memory = GlobalMemory.open();
    memory.addFinding("sample-target", finding());
    const matches = memory.search("Authorization bypass", 10);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].target, "sample-target");
    assert.equal(matches[0].finding.title, "Authorization bypass in account update");
    assert.equal(memory.updateStatus(matches[0].fingerprint, "retired", "Superseded by framework guard"), true);
    assert.equal(memory.search("Authorization bypass", 10).length, 0);
    memory.close();
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
  }
});

test("database migrations are versioned and idempotent", () => {
  const cwd = repo();
  const first = Memory.open(cwd);
  assert.equal(first.getMeta("schema_version"), "4");
  assert.equal(first.getMeta("runtime_version"), ARGUS_VERSION);
  first.close();
  const second = Memory.open(cwd);
  assert.equal(second.getMeta("schema_version"), "4");
  second.close();
});

test("schema v2 migrates existing findings without requiring an evidence packet", () => {
  const cwd = repo();
  const mem = Memory.open(cwd);
  const round = mem.createRound("main","legacy");
  const original = finding();
  mem.recordFinding(round.id,original); mem.close();
  // Reconstruct the actual v2 schema/ledger, preserving the legacy finding.
  const db = new DatabaseSync(path.join(cwd,".argus","memory.sqlite"));
  db.exec("ALTER TABLE findings DROP COLUMN evidence_package; ALTER TABLE findings DROP COLUMN review_data; DELETE FROM schema_migrations WHERE id IN ('003-evidence-packages','004-challenger-corrections'); UPDATE meta SET value='2' WHERE key='schema_version';");
  db.close();
  const migrated = Memory.open(cwd);
  assert.equal(migrated.getMeta("schema_version"),"4");
  assert.equal(migrated.getFinding(original.id).title,original.title);
  assert.equal(migrated.getFinding(original.id).evidencePackage,undefined);
  migrated.close();
});

test("schema v3 migration preserves recorded observations", () => {
  const cwd = repo(); const mem = Memory.open(cwd);
  const round = mem.createRound("main","v3");
  const original = finding({evidencePackage:evidencePacket()});
  mem.recordFinding(round.id,original); mem.close();
  const db = new DatabaseSync(path.join(cwd,".argus","memory.sqlite"));
  db.exec("ALTER TABLE findings DROP COLUMN review_data; DELETE FROM schema_migrations WHERE id='004-challenger-corrections'; UPDATE meta SET value='3' WHERE key='schema_version';");
  db.close();
  const migrated = Memory.open(cwd);
  assert.deepEqual(migrated.getFinding(original.id).evidencePackage,original.evidencePackage);
  assert.equal(migrated.getMeta("schema_version"),"4"); migrated.close();
});

test("parallel reviewer processes can write to the same SQLite memory", async () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "app.js"), "export const value = 2;\n");
  await initReview({ cwd, base: "main" });
  const cli = fileURLToPath(new URL("../dist/bin/argus.js", import.meta.url));
  const children = Array.from({ length: 8 }, (_, index) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "reviewer-run", `parallel-${index}`, "completed"], {
      cwd,
      env: { ...process.env, ARGUS_SQLITE_RETRY_MS: "5000" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  }));
  await Promise.all(children);
  const memory = Memory.open(cwd);
  const round = memory.activeRound();
  assert.ok(round);
  assert.equal(memory.listReviewerRuns(round.id).length, 8);
  memory.close();
});

test("reports never equate unmatched historical findings with verified fixes", async () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "app.js"), "export const value = 2;\n");
  await initReview({ cwd, base: "main" });
  let recorded = recordFinding(cwd, {
    reviewer: "security", category: "security", severity: "high", confidence: "high",
    title: "Authorization bypass in account update", file: "app.js", start_line: 1,
    description: "Missing ownership check.", evidence: ["unguarded update"],
    impact: "Another account can be changed.",
  });
  recordChallenge(cwd, recorded.id, "CONFIRMED", "Confirmed.");
  reconcileSingles(cwd);
  report({ cwd, write: false, promoteGlobal: false });

  await initReview({ cwd, base: "main" });
  recorded = recordFinding(cwd, {
    reviewer: "security", category: "security", severity: "high", confidence: "high",
    title: "Authorization bypass in account update", file: "app.js", start_line: 1,
    description: "Missing ownership check.", evidence: ["unguarded update"],
    impact: "Another account can be changed.",
  });
  recordChallenge(cwd, recorded.id, "CONFIRMED", "Still present.");
  reconcileSingles(cwd);
  const persistent = report({ cwd, write: false, promoteGlobal: false });
  assert.equal(persistent.result.findings[0].baselineStatus, "persistent");

  await initReview({ cwd, base: "main" });
  reconcileSingles(cwd);
  const resolved = report({ cwd, write: false, promoteGlobal: false });
  assert.equal(resolved.result.resolvedCount, 0);
  assert.deepEqual(resolved.result.resolvedFindings, []);
  assert.equal(resolved.result.unmatchedPreviousCount, 1);
  assert.equal(resolved.result.unmatchedPreviousFindings[0].title, "Authorization bypass in account update");
  assert.match(resolved.rendered, /not verified as fixed/);

  await initReview({ cwd, base: "main" });
  recorded = recordFinding(cwd, {
    reviewer: "security", category: "security", severity: "high", confidence: "high",
    title: "Authorization bypass in account update", file: "app.js", start_line: 1,
    description: "Missing ownership check.", evidence: ["unguarded update"],
    impact: "Another account can be changed.",
  });
  recordChallenge(cwd, recorded.id, "CONFIRMED", "Returned after one clean round.");
  reconcileSingles(cwd);
  const regression = report({ cwd, write: false, promoteGlobal: false });
  assert.equal(regression.result.findings[0].baselineStatus, "regression");
});

test("imported baseline and audited suppression affect the report", async () => {
  const cwd = repo();
  fs.writeFileSync(path.join(cwd, "app.js"), "export const value = 2;\n");
  fs.writeFileSync(path.join(cwd, "baseline.json"), JSON.stringify({ findings: [finding()] }));
  assert.equal(importBaseline(cwd, "baseline.json").imported, 1);
  await initReview({ cwd, base: "main" });
  const recorded = recordFinding(cwd, {
    reviewer: "security", category: "security", severity: "high", confidence: "high",
    title: "Authorization bypass in account update", file: "app.js", start_line: 1,
    description: "Missing ownership check.", evidence: ["unguarded update"],
    impact: "Another account can be changed.",
  });
  recordChallenge(cwd, recorded.id, "CONFIRMED", "Confirmed.");
  const suppression = suppressFinding(cwd, recorded.id, "Accepted risk until replacement ships", "2099-01-01");
  assert.match(suppression.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(listSuppressions(cwd).length, 1);
  reconcileSingles(cwd);
  const output = report({ cwd, write: false, promoteGlobal: false });
  assert.equal(output.result.suppressedCount, 1);
  assert.equal(output.result.findings.length, 0);
});

test("OpenCode Desktop installer preserves JSONC settings and is idempotent", () => {
  const configDir = tempDir();
  const configFile = path.join(configDir, "opencode.jsonc");
  fs.writeFileSync(
    configFile,
    '{\n  // Keep the selected model.\n  "model": "provider/model",\n}\n',
  );
  const installer = fileURLToPath(
    new URL("../scripts/install-opencode-desktop.mjs", import.meta.url),
  );

  for (let run = 0; run < 2; run += 1) {
    const result = spawnSync(
      process.execPath,
      [installer, "--config-dir", configDir],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  }

  const installed = fs.readFileSync(configFile, "utf8");
  assert.match(installed, /\/\/ Keep the selected model\./);
  assert.match(installed, /"model": "provider\/model"/);
  assert.match(installed, /"argus"/);
  assert.match(installed, /argus-mcp\.js/);
  assert.equal((installed.match(/instructions\/argus\.md/g) ?? []).length, 1);
  assert.ok(fs.existsSync(path.join(configDir, "commands", "argus.md")));
  assert.ok(fs.existsSync(path.join(configDir, "skills", "full-review", "SKILL.md")));
  assert.equal(
    fs.readdirSync(configDir).filter((name) => name.includes(".argus-backup-")).length,
    1,
  );

  const doctor = fileURLToPath(
    new URL("../scripts/doctor-opencode-desktop.mjs", import.meta.url),
  );
  const diagnosis = spawnSync(
    process.execPath,
    [doctor, "--config-dir", configDir],
    { encoding: "utf8" },
  );
  assert.equal(diagnosis.status, 0, diagnosis.stderr);
  const result = JSON.parse(diagnosis.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.checks.find((check) => check.name === "mcp:handshake")?.ok, true);
});

test("DSH installer writes the skills and MCP row, and the doctor passes", {
  skip: process.platform === "win32" ? "the stand-in dsh executable needs a POSIX shebang" : false,
}, () => {
  const dshHome = tempDir();
  const installer = fileURLToPath(new URL("../scripts/install-dsh.mjs", import.meta.url));
  const doctor = fileURLToPath(new URL("../scripts/doctor-dsh.mjs", import.meta.url));

  // Stand in for `dsh plugin --profile <name> add`, which needs DSH and pnpm.
  const fakeDsh = path.join(dshHome, "fake-dsh.cjs");
  fs.writeFileSync(
    fakeDsh,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const profile = process.argv[process.argv.indexOf("--profile") + 1];
const bundle = process.argv[process.argv.length - 1];
const dir = path.join(process.env.DSH_HOME, "profiles", profile);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
  name: "dsh-profile-" + profile,
  private: true,
  dependencies: { "@argus/dsh-plugin": "link:" + bundle },
  dsh: { profile: { bundles: [
    "@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@argus/dsh-plugin",
  ] } },
}, null, 2) + "\\n");
`,
    { mode: 0o755 },
  );

  const env = { ...process.env, DSH_HOME: dshHome };

  // A skill renamed by a newer Argus must not linger as a stale slash entry.
  const stale = path.join(dshHome, "skills", "full-review");
  fs.mkdirSync(stale, { recursive: true });
  fs.writeFileSync(path.join(stale, "SKILL.md"), "---\nname: full-review\n---\nstale\n");

  for (let run = 0; run < 2; run += 1) {
    const result = spawnSync(process.execPath, [installer, "--dsh-bin", fakeDsh], {
      encoding: "utf8",
      env,
    });
    assert.equal(result.status, 0, result.stderr);
  }

  // Re-running updates in place: one MCP row, no duplicated insert entries.
  const patch = fs.readFileSync(path.join(dshHome, "cordis.patch.yml"), "utf8");
  assert.match(patch, /id: mcp-argus/);
  assert.match(patch, /argus-mcp\.js/);
  assert.equal((patch.match(/id: mcp-argus/g) ?? []).length, 1);
  assert.equal(
    fs.readdirSync(dshHome).filter((name) => name.includes(".argus-backup-")).length,
    0,
  );
  assert.ok(fs.existsSync(path.join(dshHome, "skills", "argus-review", "SKILL.md")));
  assert.equal(fs.existsSync(stale), false);

  const diagnosis = spawnSync(process.execPath, [doctor, "--dsh-bin", fakeDsh], {
    encoding: "utf8",
    env,
  });
  assert.equal(diagnosis.status, 0, diagnosis.stderr);
  const result = JSON.parse(diagnosis.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.checks.find((check) => check.name === "mcp:handshake")?.ok, true);
  assert.equal(result.checks.find((check) => check.name === "bundle:registered")?.ok, true);
  assert.equal(result.checks.find((check) => check.name === "skills:no-stale")?.ok, true);
  assert.equal(result.checks.filter((check) => check.name.startsWith("skill:")).length, 6);
});
