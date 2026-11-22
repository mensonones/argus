import test from "node:test";
import assert from "node:assert/strict";

import { recommendedCode, sameFixGroups, sameFixPeers } from "../dist/report/same-fix.js";
import { renderMarkdown } from "../dist/report/markdown.js";
import { renderTerminal } from "../dist/report/terminal.js";
import { renderJson } from "../dist/report/json.js";

const FIX = "setItems((current) => [...current, item])";
const finding = (id, file, recommendation, title = `Finding ${id}`) => ({
  id, file, title, category: "correctness", severity: "medium", confidence: "high",
  description: "d", evidence: ["e"], impact: "i", recommendation, reviewer: "correctness",
});
const result = (findings) => ({
  baseRef: "main", projectSummary: "p", reviewersRun: [], candidateCount: findings.length,
  rejectedCount: 0, duplicatesRemoved: 0, suppressedCount: 0, resolvedCount: 0,
  unmatchedPreviousCount: 0, incorporatedBaselineCount: 0, incorporatedBaselineFindings: [],
  unmatchedPreviousFindings: [], findings, reviewerStats: [], resolvedFindings: [],
});

// The three useCart recommendations reported on Codex differ in wording and backticks.
const cart = [
  finding("a", "src/useCart.js", `Restore \`${FIX}\` so each addition queues a new state reference.`),
  finding("b", "src/useCart.js", `Restore a functional append, \`${FIX}\`, so the addition starts from the earlier update.`),
  finding("c", "src/useCart.js", `Append with a functional immutable state update, such as ${FIX}, so cart changes preserve the input.`),
  finding("d", "src/useWindowWidth.js", "Use the same named callback to register the resize listener and remove it in the cleanup."),
];

test("recommendations quoting the same code are grouped despite wording and backtick differences", () => {
  const groups = sameFixGroups(cart);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].indices, [0, 1, 2]);
  assert.equal(groups[0].file, "src/useCart.js");
  assert.equal(groups[0].code, FIX);
  assert.deepEqual(sameFixPeers(cart).get(1).peers, [0, 2]);
  assert.equal(sameFixPeers(cart).has(3), false);
});

test("no group without quoted code, across files, or for short or non-code spans", () => {
  assert.deepEqual(recommendedCode("Add a null check before use."), []);
  assert.deepEqual(recommendedCode(undefined), []);
  assert.deepEqual(recommendedCode("Call `foo()` here"), []);
  assert.deepEqual(recommendedCode("Rename `someIdentifierName` to something clearer"), []);
  const crossFile = [finding("x", "a.js", `Use \`${FIX}\``), finding("y", "b.js", `Use \`${FIX}\``)];
  assert.deepEqual(sameFixGroups(crossFile), []);
  const different = [finding("x", "a.js", "Use `items.filter((i) => i.id !== id)`"),
    finding("y", "a.js", "Use `items.map((i) => ({ ...i, seen: true }))`")];
  assert.deepEqual(sameFixGroups(different), []);
});

test("markdown notes the shared change without altering the findings", () => {
  const out = renderMarkdown(result(cart));
  assert.match(out, /\*\*Same recommended change as:\*\* #2, #3/);
  assert.match(out, /\*\*Same recommended change as:\*\* #1, #3/);
  assert.match(out, /one edit may address them together/);
  assert.equal((out.match(/Same recommended change as/g) ?? []).length, 3);
  assert.equal(renderMarkdown(result([cart[3]])).includes("Same recommended change"), false);
});

test("terminal and json expose the same grouping", () => {
  const terminal = renderTerminal(result(cart));
  assert.match(terminal, /Same recommended change as/);
  assert.match(terminal, /"Finding b"/);
  const json = JSON.parse(renderJson(result(cart)));
  assert.deepEqual(json.sameRecommendedChange, [{ file: "src/useCart.js", code: FIX, findingIds: ["a", "b", "c"] }]);
  assert.deepEqual(json.findings.map((f) => f.id), ["a", "b", "c", "d"]);
  assert.deepEqual(JSON.parse(renderJson(result([cart[3]]))).sameRecommendedChange, []);
});
