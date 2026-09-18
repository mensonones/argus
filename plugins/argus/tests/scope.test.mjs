import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildDiff } from "../dist/git.js";
import { initReview, reviewContext, recordFinding, recordChallenge, listFindings,
  reconcileFindings, report } from "../dist/service.js";

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "argus-scope-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (file, body) => fs.writeFileSync(path.join(cwd, file), body);
  git("init", "-q", "-b", "main"); git("config", "user.email", "argus@example.test"); git("config", "user.name", "Argus Test");
  write("app.js", "export const value = 1;\n"); git("add", "."); git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD"); git("switch", "-c", "feature");
  write("app.js", "export const value = 2;\n"); git("add", "."); git("commit", "-qm", "feature");
  return { cwd, git, write, base, feature: git("rev-parse", "HEAD") };
}

test("auto clean selects non-merge commit patches and preserves cancellation between commits", async t => {
  const f = fixture(t);
  f.write("app.js", "export const value = 1;\n"); f.git("add", "."); f.git("commit", "-qm", "restore");
  const diff = await buildDiff(f.cwd, { base: "main" });
  assert.equal(diff.scope.mode, "branch-commits"); assert.equal(diff.scope.includeWorkingTree, false);
  assert.deepEqual(diff.scope.selectedCommits, [f.feature, f.git("rev-parse", "HEAD")]);
  assert.equal(diff.patchSets.length, 2); assert.match(diff.patchSets[0].raw, /\+export const value = 2/);
  assert.equal(f.git("diff", "main", "HEAD"), "");
});

test("auto local scope excludes branch commits and preserves opposing staged and unstaged patches", async t => {
  const f = fixture(t);
  f.write("app.js", "export const value = 3;\n"); f.git("add", "app.js");
  f.write("app.js", "export const value = 2;\n");
  const diff = await buildDiff(f.cwd, { base: "main" });
  assert.equal(diff.scope.mode, "working-tree"); assert.deepEqual(diff.scope.selectedCommits, []);
  assert.deepEqual(diff.patchSets.map(s => s.kind), ["staged", "unstaged"]);
  assert.match(diff.patchSets[0].raw, /\+export const value = 3/);
  assert.match(diff.patchSets[1].raw, /\-export const value = 3/);
  assert.doesNotMatch(diff.raw, /\-export const value = 1/);
});

test("auto includes untracked code but ignores Argus artifacts, docs and configured ignored files", async t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.cwd, ".argus")); f.write(".argus/noise.js", "noise\n");
  f.write("README.md", "docs\n"); f.write("ignored.js", "ignored\n");
  f.write("argus.yaml", "ignore:\n  - ignored.js\n");
  const first = await initReview({ cwd: f.cwd, base: "main" });
  assert.equal(first.scope.mode, "branch-commits");
  // Detection can be exercised without opening a second active runtime round.
  f.write("new.js", "export const local = 1;\n");
  const local = await buildDiff(f.cwd, { base: "main", isReviewablePath: p => p === "new.js" });
  assert.equal(local.scope.mode, "working-tree"); assert.ok(local.patchSets.some(s => s.kind === "untracked" && s.files.some(x => x.path === "new.js")));
  assert.ok(local.files.every(x => !x.path.startsWith(".argus/")));
});

test("explicit branch commits exclude local edits, upstream commits and merge-only resolution changes", async t => {
  const f = fixture(t);
  f.git("switch", "main"); f.write("upstream.js", "export const upstream = 1;\n"); f.git("add", "."); f.git("commit", "-qm", "upstream");
  const upstream = f.git("rev-parse", "HEAD"); f.git("switch", "feature");
  f.git("merge", "--no-ff", "--no-commit", "main"); f.write("merge-only.js", "export const resolution = 1;\n");
  f.git("add", "."); f.git("commit", "-qm", "merge with resolution"); const merge = f.git("rev-parse", "HEAD");
  f.write("local.js", "export const local = 1;\n");
  const diff = await buildDiff(f.cwd, { base: "main", mode: "branch-commits" });
  assert.deepEqual(diff.scope.selectedCommits, [f.feature]);
  assert.equal(diff.scope.mergePolicy, "merges-excluded");
  assert.ok(!diff.scope.selectedCommits.includes(upstream) && !diff.scope.selectedCommits.includes(merge));
  assert.deepEqual(diff.files.map(x => x.path), ["app.js"]);
  const integrated = await buildDiff(f.cwd, { base: "main", mode: "integrated-branch-diff", includeWorkingTree: false });
  assert.ok(integrated.files.some(x => x.path === "merge-only.js"));
});

test("path restrictions, committed-only precedence and empty branch scope are explicit", async t => {
  const f = fixture(t); f.write("local.js", "local\n");
  const committed = await buildDiff(f.cwd, { base: "main", includeWorkingTree: false });
  assert.equal(committed.scope.mode, "branch-commits");
  const filtered = await buildDiff(f.cwd, { base: "main", paths: ["missing.js"] });
  assert.equal(filtered.files.length, 0); assert.deepEqual(filtered.scope.selectedCommits, []);
  f.git("switch", "main"); fs.unlinkSync(path.join(f.cwd, "local.js"));
  const empty = await buildDiff(f.cwd, { base: "main" }); assert.equal(empty.files.length, 0);
  await assert.rejects(() => buildDiff(f.cwd, { mode: "working-tree", includeWorkingTree: false }), /conflicts/);
  await assert.rejects(() => buildDiff(f.cwd, { commit: f.feature, mode: "branch-commits" }), /mutually exclusive/);
});

test("selected patch attribution survives challenges, attachment and rendered reports", async t => {
  const f = fixture(t); const initialized = await initReview({ cwd: f.cwd, base: "main" });
  assert.deepEqual(reviewContext(f.cwd, initialized.roundId).patchSets, initialized.patchSets);
  const input = { reviewer: "correctness", category: "correctness", title: "Synthetic patch candidate", file: "app.js",
    description: "Synthetic transport fixture", evidence: ["app.js patch"], impact: "Fixture only" };
  assert.throws(() => recordFinding(f.cwd, input), /source_commits/);
  assert.throws(() => recordFinding(f.cwd, { ...input, source_commits: [f.base] }), /source_commits/);
  const recorded = recordFinding(f.cwd, { ...input, source_commits: [f.feature] });
  recordChallenge(f.cwd, recorded.id, "CONFIRMED", "Fixture transport confirmed");
  assert.deepEqual(listFindings(f.cwd)[0].sourceCommits, [f.feature]);
  reconcileFindings(f.cwd, [{ canonical_id: recorded.id, members: [{ finding_id: recorded.id, category: "correctness" }],
    rootCause: { symbol: "fixture", mechanism: "fixture", invariant: "fixture" }, reasoning: "Fixture", claims_reviewed: true }]);
  const json = JSON.parse(report({ cwd: f.cwd, format: "json", write: false, promoteGlobal: false }).rendered);
  assert.deepEqual(json.scope.selectedCommits, [f.feature]); assert.deepEqual(json.findings[0].sourceCommits, [f.feature]);
});

test("MCP explicit commit mode supplies immutable patch sets to a fresh child attachment", async t => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const f = fixture(t); f.write("local.js", "local\n");
  async function worker() {
    const c = new Client({ name: "scope-test", version: "1" });
    await c.connect(new StdioClientTransport({ command: process.execPath,
      args: [path.resolve(import.meta.dirname, "../dist/bin/argus-mcp.js")], cwd: f.cwd, stderr: "pipe" }));
    return c;
  }
  const parent = await worker(), child = await worker();
  try {
    const result = await parent.callTool({ name: "argus_init", arguments: { repo_path: f.cwd, base: "main", mode: "branch-commits" } });
    assert.ok(!result.isError); const initialized = JSON.parse(result.content[0].text);
    assert.deepEqual(initialized.scope.selectedCommits, [f.feature]);
    assert.ok(initialized.patchSets.every(set => set.kind === "commit"));
    const context = { repo_path: f.cwd, round_id: initialized.roundId };
    // Changing a local file after init must not replace the stored patch payload.
    f.write("app.js", "export const value = 999;\n");
    const attached = await child.callTool({ name: "argus_init", arguments: context });
    assert.ok(!attached.isError); assert.deepEqual(JSON.parse(attached.content[0].text).patchSets, initialized.patchSets);
    const changedScope = await child.callTool({ name: "argus_init", arguments: { ...context, mode: "working-tree" } });
    assert.equal(changedScope.isError, true);
  } finally { await Promise.all([parent.close(), child.close()]); }
});
