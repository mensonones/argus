#!/usr/bin/env node
// Score the adjudicated evaluation corpus and print the per-arm comparison.
// Reads eval/corpus/<repo>/<caseId>/{case.json,issues.json,runs/<arm>/run-*.json}.
// The corpus is private (gitignored); this scorer is generic and public.
//
// Arms:
//   single       — runs/single/run-*.json (baseline single-prompt findings)
//   specialists  — derived from runs/full/run-*.json (all candidates)
//   full         — derived from runs/full/run-*.json (verdict !== "REJECTED")
//
// Adjudication (human): each finding.adjudication is a gabarito issue id, or
// null for noise. Recall counts issues with mustFind:true.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CORPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "corpus");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function listRuns(dir) {
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(dir, f)))
    : [];
}

// Score one arm's finding list for one case/run against the gabarito.
function scoreRun(findings, issues, control) {
  const mustFind = new Set(issues.filter((i) => i.mustFind !== false).map((i) => i.id));
  const matched = new Set();
  let fp = 0;
  for (const f of findings) {
    if (f.adjudication == null) { fp++; continue; }       // noise
    if (mustFind.has(f.adjudication)) matched.add(f.adjudication); // true positive
    // adjudication to a non-mustFind issue: neither tp nor fp (extra)
  }
  const tp = matched.size;
  const fn = control ? 0 : mustFind.size - matched.size;
  return { tp, fp, fn, matched, controlNoise: control ? fp : 0 };
}

function reportedFor(arm, fullRuns, singleRuns) {
  // Returns array of { findings } per run for the requested arm.
  if (arm === "single") return singleRuns.map((r) => ({ findings: r.findings || [] }));
  if (arm === "specialists") return fullRuns.map((r) => ({ findings: r.findings || [] }));
  // full: drop Challenger-rejected findings
  return fullRuns.map((r) => ({ findings: (r.findings || []).filter((f) => f.verdict !== "REJECTED") }));
}

const arms = ["single", "specialists", "full"];
const agg = Object.fromEntries(arms.map((a) => [a, { tp: 0, fp: 0, fn: 0, controlNoise: 0, runs: 0, variability: [] }]));
const challenger = { wrongReject: 0, wrongConfirm: 0 };
let cases = 0, controls = 0;

if (!fs.existsSync(CORPUS)) { console.error("No eval/corpus/ yet — annotate cases first (see eval/PROTOCOL.md)."); process.exit(1); }

for (const repoDir of fs.readdirSync(CORPUS)) {
  const repoPath = path.join(CORPUS, repoDir);
  if (!fs.statSync(repoPath).isDirectory()) continue;
  for (const caseId of fs.readdirSync(repoPath)) {
    const caseDir = path.join(repoPath, caseId);
    if (!fs.existsSync(path.join(caseDir, "case.json"))) continue;
    const c = readJson(path.join(caseDir, "case.json"));
    const issues = (readJson(path.join(caseDir, "issues.json")).issues) || [];
    const control = !!c.control;
    cases++; if (control) controls++;

    const fullRuns = listRuns(path.join(caseDir, "runs", "full"));
    const singleRuns = listRuns(path.join(caseDir, "runs", "single"));

    // Challenger effect from full runs: wrong rejects / wrong confirms.
    const mustFind = new Set(issues.filter((i) => i.mustFind !== false).map((i) => i.id));
    for (const r of fullRuns) for (const f of r.findings || []) {
      if (f.verdict === "REJECTED" && f.adjudication && mustFind.has(f.adjudication)) challenger.wrongReject++;
      if (f.verdict === "CONFIRMED" && f.adjudication == null) challenger.wrongConfirm++;
    }

    for (const arm of arms) {
      const runs = reportedFor(arm, fullRuns, singleRuns);
      const perRun = runs.map((r) => scoreRun(r.findings, issues, control));
      for (const s of perRun) {
        agg[arm].tp += s.tp; agg[arm].fp += s.fp; agg[arm].fn += s.fn;
        agg[arm].controlNoise += s.controlNoise; agg[arm].runs++;
      }
      // variability: symmetric difference of matched-issue sets across runs
      if (perRun.length >= 2) {
        const a = perRun[0].matched, b = perRun[1].matched;
        let diff = 0;
        for (const x of a) if (!b.has(x)) diff++;
        for (const x of b) if (!a.has(x)) diff++;
        agg[arm].variability.push(diff + Math.abs(perRun[0].fp - perRun[1].fp));
      }
    }
  }
}

function pct(n, d) { return d ? ((100 * n) / d).toFixed(0) + "%" : "—"; }
function avg(xs) { return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "—"; }

const repoGroups = fs.readdirSync(CORPUS).filter((d) => fs.statSync(path.join(CORPUS, d)).isDirectory()).length;
console.log(`Corpus: ${cases} cases (${controls} controls) across ${repoGroups} repo group(s)\n`);
console.log("arm          recall   precision   control-noise   runs   run-to-run Δ");
console.log("----------   ------   ---------   -------------   ----   ------------");
for (const arm of arms) {
  const a = agg[arm];
  const recall = pct(a.tp, a.tp + a.fn);
  const precision = pct(a.tp, a.tp + a.fp);
  console.log(
    `${arm.padEnd(12)} ${recall.padStart(6)}   ${precision.padStart(9)}   ${String(a.controlNoise).padStart(13)}   ${String(a.runs).padStart(4)}   ${avg(a.variability).padStart(12)}`,
  );
}
console.log(`\nChallenger effect (full arm): wrong rejects=${challenger.wrongReject}, wrong confirms=${challenger.wrongConfirm}`);
console.log("\nThe claim holds if full ≥ specialists ≥ single on precision / control-noise");
console.log("without a material recall drop, and Challenger wrong-rejects stay low.");
console.log("Publish with limitations (small corpus, single annotator, fixed host/model).");
