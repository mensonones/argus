import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dataset, score } from "../../../eval/score.mjs";

function run(configuration = "full") {
  return { schemaVersion:1, dataset:dataset.id, configuration,
    host:"unit-test", model:"none", revision:"test", adjudicator:"test",
    cases:dataset.cases.map(c => ({caseId:c.id,candidates:c.issues.map(i=>({
      id:i.id,issueId:i.id,verdict:configuration === "full" ? "CONFIRMED" : "NOT_CHALLENGED",reason:"test annotation"
    }))})) };
}

test("prepared reviewer tasks do not leak labels or bug/control names", () => {
  const output = JSON.parse(execFileSync(process.execPath,
    [fileURLToPath(new URL("../../../eval/prepare.mjs",import.meta.url))],{encoding:"utf8"}));
  assert.equal(output.cases.length,8);
  for (const item of output.cases) {
    assert.match(item.caseId,/^task-\d{2}$/);
    assert.equal(item.issues,undefined);
    assert.equal(item.category,undefined);
  }
});

test("eval perfect annotations cover defects and clean controls", () => {
  const result = score(run());
  assert.deepEqual(result.final, {tp:4,fp:0,fn:0,precision:1,recall:1,f1:1});
  assert.equal(result.controlFalsePositiveRate, 0);
});
test("eval exposes Challenger false negatives and retained noise", () => {
  const input = run();
  input.cases[0].candidates[0].verdict = "REJECTED";
  input.cases[1].candidates.push({id:"noise",issueId:null,verdict:"PLAUSIBLE",reason:"test false positive"});
  input.cases[3].candidates.push({id:"rejected-noise",issueId:null,verdict:"REJECTED",reason:"guard prevents it"});
  const result = score(input);
  assert.equal(result.final.fn, 1);
  assert.equal(result.final.fp, 1);
  assert.equal(result.trueIssuesRejected, 1);
  assert.equal(result.falseCandidatesRejected, 1);
  assert.equal(result.controlFalsePositiveRate, 0.25);
});
test("eval does not give empty output perfect precision or duplicated output extra recall", () => {
  const input = run("single");
  const f = input.cases[0].candidates[0];
  input.cases[0].candidates.push({...f,id:"duplicate"});
  assert.equal(score(input).final.fp,1);
  for (const item of input.cases) item.candidates = [];
  assert.equal(score(input).final.precision,null);
  assert.equal(score(input).final.recall,0);
});
test("eval rejects missing cases, unknown labels and invalid ablations", () => {
  const input = run();
  input.cases.pop();
  assert.throws(()=>score(input),/Every case/);
  const unknown = run(); unknown.cases[0].candidates[0].issueId = "invented";
  assert.throws(()=>score(unknown),/Invalid adjudicated/);
  const bad = run("single"); bad.cases[0].candidates[0].verdict = "CONFIRMED";
  assert.throws(()=>score(bad),/ablations/);
});

function load(id, name) {
  const source = dataset.cases.find(c=>c.id === id).source.replace("export ", "");
  return vm.runInNewContext(`${source}; ${name}`, {}, {timeout:1000});
}
test("pilot correctness and security witnesses distinguish bug/control", () => {
  assert.ok(Number.isNaN(load("correctness-bug","average")([])));
  assert.equal(load("correctness-control","average")([]),0);
  const account = {owner:2,value:0};
  load("security-bug","update")({id:1},account,9);
  assert.equal(account.value,9);
  assert.throws(()=>load("security-control","update")({id:1},account,10),/forbidden/);
  load("security-control","update")({id:2},account,10);
  assert.equal(account.value,10);
});
test("pilot performance witness counts database round trips", async () => {
  for (const [id,expected] of [["performance-bug",3],["performance-control",1]]) {
    let calls = 0;
    const db = {get:async id=>{calls++;return id;},getMany:async ids=>{calls++;return ids;}};
    const result = await load(id,"users")([1,2,3],db);
    assert.deepEqual(Array.from(result),[1,2,3]);
    assert.equal(calls,expected);
  }
});
