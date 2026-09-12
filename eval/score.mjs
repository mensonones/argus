import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const dataset = JSON.parse(fs.readFileSync(new URL("./dataset.json", import.meta.url), "utf8"));

/** Score human-adjudicated matches, not titles or an unvalidated LLM judge. */
export function score(run, corpus = dataset) {
  if (run.schemaVersion !== 1 || run.dataset !== corpus.id ||
      !["single", "specialists", "full"].includes(run.configuration) ||
      !["host", "model", "revision", "adjudicator"].every(k => typeof run[k] === "string" && run[k].trim())) {
    throw new Error("Run requires schemaVersion, dataset, configuration, host, model, revision and adjudicator.");
  }
  if (!Array.isArray(run.cases) || run.cases.length !== corpus.cases.length) throw new Error("Every case must be reviewed, including controls.");
  const seen = new Set();
  const stages = { candidate: { tp:0, fp:0, fn:0 }, final: { tp:0, fp:0, fn:0 } };
  let trueIssuesRejected = 0, falseCandidatesRejected = 0, noisyControls = 0;
  for (const result of run.cases) {
    const item = corpus.cases.find(c => c.id === result.caseId);
    if (!item || seen.has(item.id) || !Array.isArray(result.candidates)) throw new Error("Unknown, duplicate or invalid case.");
    seen.add(item.id);
    const ids = new Set();
    const expected = new Set(item.issues.map(i => i.id));
    for (const f of result.candidates) {
      if (typeof f.id !== "string" || !f.id.trim() || ids.has(f.id) ||
          !(f.issueId === null || expected.has(f.issueId)) ||
          !["CONFIRMED", "PLAUSIBLE", "REJECTED", "NOT_CHALLENGED"].includes(f.verdict) ||
          typeof f.reason !== "string" || !f.reason.trim()) throw new Error("Invalid adjudicated finding.");
      if ((run.configuration === "full") === (f.verdict === "NOT_CHALLENGED")) throw new Error("Only full runs require Challenger verdicts; ablations must use NOT_CHALLENGED.");
      ids.add(f.id);
      if (f.verdict === "REJECTED") {
        if (f.issueId === null) falseCandidatesRejected++; else trueIssuesRejected++;
      }
    }
    for (const [stage, counts] of Object.entries(stages)) {
      const findings = result.candidates.filter(f => stage === "candidate" || f.verdict !== "REJECTED");
      const matched = new Set();
      for (const f of findings) {
        if (f.issueId !== null && !matched.has(f.issueId)) { counts.tp++; matched.add(f.issueId); }
        else counts.fp++; // Duplicate reports count as noise, not extra recall.
      }
      counts.fn += expected.size - matched.size;
      if (stage === "final" && expected.size === 0 && findings.length) noisyControls++;
    }
  }
  function metrics({tp,fp,fn}) {
    return { tp, fp, fn, precision: tp+fp ? tp/(tp+fp) : null,
      recall: tp+fn ? tp/(tp+fn) : null, f1: 2*tp+fp+fn ? 2*tp/(2*tp+fp+fn) : null };
  }
  const controls = corpus.cases.filter(c => !c.issues.length).length;
  return { dataset: corpus.id, configuration: run.configuration,
    metadata: Object.fromEntries(["host","model","revision","adjudicator"].map(k=>[k,run[k]])),
    candidate: metrics(stages.candidate), final: metrics(stages.final),
    trueIssuesRejected, falseCandidatesRejected,
    controlFalsePositiveRate: controls ? noisyControls / controls : null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: npm run eval:score -- <adjudicated-run.json>");
    console.log(JSON.stringify(score(JSON.parse(fs.readFileSync(process.argv[2], "utf8"))), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
