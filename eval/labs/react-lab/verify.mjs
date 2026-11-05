#!/usr/bin/env node
// Confirms the React lab ground truth by executing the hooks.
//   npm install            (once, in this folder)
//   npm run verify -- /absolute/path/to/argus-react-lab
// Expected: on `main` every check passes; on `feature/hooks-tweaks` D1-D3 fail
// and the controls C1-C3 still pass. Exits non-zero on any other outcome.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const lab = process.argv[2];
if (!lab) {
  console.error("usage: node verify.mjs /absolute/path/to/argus-react-lab");
  process.exit(2);
}

const hooks = ["useCart", "useWindowWidth", "useUserSearch", "useUser", "useToggle", "useDocumentTitle"];
const refs = [
  { ref: "main", failing: [] },
  { ref: "feature/hooks-tweaks", failing: ["D1", "D2", "D3"] },
];

let mismatches = 0;
for (const { ref, failing } of refs) {
  const dir = path.join(here, ".tmp", ref.replace(/[^\w.-]/g, "_"));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const hook of hooks) {
    const source = execFileSync("git", ["-C", lab, "show", `${ref}:src/hooks/${hook}.js`], { encoding: "utf8" });
    fs.writeFileSync(path.join(dir, `${hook}.js`), source);
  }
  const run = spawnSync(process.execPath, [path.join(here, "check.mjs"), dir], { encoding: "utf8" });
  if (run.status !== 0) {
    console.error(run.stderr || run.stdout);
    process.exit(1);
  }
  const results = JSON.parse(run.stdout.trim().split("\n").pop());
  console.log(`\n== ${ref}`);
  for (const r of results) {
    const expectedOk = !failing.includes(r.id);
    const matches = r.ok === expectedOk;
    if (!matches) mismatches += 1;
    console.log(`${matches ? "as expected" : "UNEXPECTED"}  ${r.ok ? "pass" : "FAIL"}  ${r.id} ${r.name} (${r.note})`);
  }
}

fs.rmSync(path.join(here, ".tmp"), { recursive: true, force: true });
if (mismatches) {
  console.error(`\n${mismatches} unexpected result(s): the ground truth is not confirmed.`);
  process.exit(1);
}
console.log("\nGround truth confirmed.");
