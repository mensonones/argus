#!/usr/bin/env node
// Collect a completed Argus round from a repo's .argus SQLite into a corpus
// run file (arm "full"). One full round yields BOTH arms at scoring time:
//   - specialists = every recorded candidate (verdict ignored)
//   - full        = candidates the Challenger did not REJECT
// so you do not run a separate specialists arm. The "single" arm is saved
// manually from the baseline prompt.
//
// Usage:
//   node eval/collect.mjs --repo <path> [--round <id|latest>] --out <file.json> \
//        [--host codex] [--model gpt-5.x] [--run 1]
//
// The emitted findings have adjudication:null — you fill each with the gabarito
// issue id it matches, or leave null for noise.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const repo = arg("repo");
if (!repo) { console.error("--repo <path> is required"); process.exit(1); }
const dbPath = path.join(repo, ".argus", "memory.sqlite");
if (!fs.existsSync(dbPath)) { console.error(`No .argus DB at ${dbPath}`); process.exit(1); }

const db = new DatabaseSync(dbPath);
let round = arg("round", "latest");
if (round === "latest") {
  const r = db.prepare("SELECT id FROM rounds ORDER BY created_at DESC LIMIT 1").get();
  if (!r) { console.error("No rounds in DB"); process.exit(1); }
  round = r.id;
}

const rows = db.prepare(
  "SELECT file, start_line, title, status, challenge_result FROM findings WHERE round_id=? ORDER BY created_at",
).all(round);

const findings = rows.map((r) => ({
  ref: r.start_line ? `${r.file}:${r.start_line}` : r.file,
  title: r.title,
  verdict: r.challenge_result ?? null, // CONFIRMED | PLAUSIBLE | REJECTED | null
  adjudication: null,                  // fill: gabarito issue id, or null = noise
}));

const out = {
  arm: "full",
  run: Number(arg("run", "1")),
  host: arg("host", ""),
  model: arg("model", ""),
  round,
  seconds: null,
  tokens: null,
  findings,
};

const outFile = arg("out");
const json = JSON.stringify(out, null, 2) + "\n";
if (outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, json);
  console.error(`Wrote ${findings.length} findings to ${outFile} (round ${round}). Fill in adjudication.`);
} else {
  process.stdout.write(json);
}
