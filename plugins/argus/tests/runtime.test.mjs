import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { loadConfig } from "../dist/config.js";
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
  suppressFinding,
} from "../dist/service.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "argus-test-"));
}

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
  assert.equal(first.getMeta("runtime_version"), "0.2.1");
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

test("reports classify persistent and resolved findings between rounds", async () => {
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
  report({ cwd, write: false, promoteGlobal: false });

  await initReview({ cwd, base: "main" });
  recorded = recordFinding(cwd, {
    reviewer: "security", category: "security", severity: "high", confidence: "high",
    title: "Authorization bypass in account update", file: "app.js", start_line: 1,
    description: "Missing ownership check.", evidence: ["unguarded update"],
    impact: "Another account can be changed.",
  });
  recordChallenge(cwd, recorded.id, "CONFIRMED", "Still present.");
  const persistent = report({ cwd, write: false, promoteGlobal: false });
  assert.equal(persistent.result.findings[0].baselineStatus, "persistent");

  await initReview({ cwd, base: "main" });
  const resolved = report({ cwd, write: false, promoteGlobal: false });
  assert.equal(resolved.result.resolvedCount, 1);
  assert.equal(resolved.result.resolvedFindings[0].title, "Authorization bypass in account update");

  await initReview({ cwd, base: "main" });
  recorded = recordFinding(cwd, {
    reviewer: "security", category: "security", severity: "high", confidence: "high",
    title: "Authorization bypass in account update", file: "app.js", start_line: 1,
    description: "Missing ownership check.", evidence: ["unguarded update"],
    impact: "Another account can be changed.",
  });
  recordChallenge(cwd, recorded.id, "CONFIRMED", "Returned after one clean round.");
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
