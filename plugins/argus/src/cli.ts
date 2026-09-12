import { parseArgs } from "node:util";
import {
  initReview,
  recordFinding,
  recordChallenge,
  recordReviewerRun,
  listFindings,
  memorySearch,
  importBaseline,
  suppressFinding,
  listSuppressions,
  updateGlobalMemory,
  report,
  type FindingInput,
} from "./service.js";
import type { ChallengeResult, Severity, EvidencePackage, FindingCorrection, RootCause } from "./types.js";
import { color } from "./logger.js";
import { ARGUS_VERSION } from "./version.js";

const VERSION = ARGUS_VERSION;

const ARGUS_YAML_TEMPLATE = `# Argus configuration (https://github.com/mensonones/argus)
reviewers:
  correctness: true
  security: true
  performance: true
  architecture: true
  tests: false

severity:
  minimum: low          # hide findings below this severity in the report

review:
  max_findings: 20

ignore:
  - "**/*.generated.*"
  - "**/vendor/**"
  - "**/node_modules/**"

architecture:
  rules:
    - "domain must not depend on infrastructure"

security:
  strict: true
`;

const HELP = `
${color.bold("argus")} — deterministic runtime for the Argus review plugin

Usage
  argus <command> [options]

Commands
  init [paths...]           Detect repo, diff, open a review round
    --base <ref>            Base branch/ref (default: auto-detect)
    --commit <sha>          Review a single commit
    --committed-only       Exclude staged, unstaged, and untracked changes
  list [--status s]         List findings (candidate|confirmed|rejected)
  reviewer-run <id> <s>     Record reviewer status (started|completed|failed)
  record-finding --json <j> Record a finding from a JSON object (or stdin)
  challenge <id> <verdict>  Record a challenge (CONFIRMED|PLAUSIBLE|REJECTED)
    --reason <text> [--evidence-package <json>] [--correction <json>] [--root-cause <json>]
  memory <query>            Search past findings for this target
  memory-status <fp> <s>    Set global memory active|retired [--note text]
  baseline-import <file>    Import findings from an Argus JSON report
  suppress <id>             Suppress a finding fingerprint
    --reason <text>         Required audit reason
    --expires <ISO date>    Optional expiry
  suppressions [--all]      List active (or all) suppressions
  config-init               Write a starter argus.yaml in the repo root
  report                    Deduplicate, rank, render the final report
    --format <fmt>          terminal | markdown | json
    --min-severity <sev>
    --max-findings <n>
  mcp                       Start the MCP server (stdio)
  --version | --help

Notes
  Prefer the Argus MCP tools (argus_*) inside your assistant; this CLI is the
  fallback and the MCP launcher.
`.trim();

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const cwd = process.cwd();

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    return 0;
  }
  if (command === "--version") {
    console.log(VERSION);
    return 0;
  }

  try {
    switch (command) {
      case "mcp": {
        const { startServer } = await import("./mcp.js");
        await startServer();
        return 0; // server runs until stdin closes
      }
      case "init": {
        const { values, positionals } = parseArgs({
          args: rest,
          allowPositionals: true,
          options: {
            base: { type: "string" },
            commit: { type: "string" },
            "committed-only": { type: "boolean" },
          },
        });
        const res = await initReview({
          cwd,
          base: values.base,
          commit: values.commit,
          includeWorkingTree: !values["committed-only"],
          paths: positionals.length ? positionals : undefined,
        });
        console.log(JSON.stringify(res, null, 2));
        return 0;
      }
      case "list": {
        const { values } = parseArgs({
          args: rest,
          options: { status: { type: "string" } },
        });
        console.log(JSON.stringify(listFindings(cwd, values.status), null, 2));
        return 0;
      }
      case "record-finding": {
        const { values } = parseArgs({
          args: rest,
          options: { json: { type: "string" } },
        });
        const raw = values.json ?? (await readStdin());
        const input = JSON.parse(raw) as FindingInput;
        console.log(JSON.stringify(recordFinding(cwd, input), null, 2));
        return 0;
      }
      case "reviewer-run": {
        const [reviewer, status] = rest;
        const { values } = parseArgs({
          args: rest.slice(2),
          options: { detail: { type: "string" } },
        });
        if (!reviewer || !["started", "completed", "failed"].includes(status)) {
          console.error("Usage: argus reviewer-run <id> <started|completed|failed> [--detail text]");
          return 1;
        }
        recordReviewerRun(
          cwd,
          reviewer,
          status as "started" | "completed" | "failed",
          values.detail,
        );
        console.log(`Recorded ${reviewer}: ${status}.`);
        return 0;
      }
      case "challenge": {
        const [id, verdict] = rest;
        const { values } = parseArgs({
          args: rest.slice(2),
          options: { reason: { type: "string" }, "evidence-package": { type: "string" },
            correction: {type:"string"}, "root-cause": {type:"string"} },
        });
        if (!id || !["CONFIRMED", "PLAUSIBLE", "REJECTED"].includes(verdict)) {
          console.error("Usage: argus challenge <id> <CONFIRMED|PLAUSIBLE|REJECTED> --reason <text>");
          return 1;
        }
        const ok = recordChallenge(
          cwd,
          id,
          verdict as ChallengeResult,
          values.reason ?? "",
          values["evidence-package"] ? JSON.parse(values["evidence-package"]) as EvidencePackage : undefined,
          values.correction ? JSON.parse(values.correction) as FindingCorrection : undefined,
          values["root-cause"] ? JSON.parse(values["root-cause"]) as RootCause : undefined,
        );
        console.log(ok ? `Recorded ${verdict} for ${id}.` : `No finding ${id}.`);
        return ok ? 0 : 1;
      }
      case "memory": {
        const query = rest.join(" ");
        console.log(JSON.stringify(memorySearch(cwd, query), null, 2));
        return 0;
      }
      case "memory-status": {
        const [fingerprint, status] = rest;
        const { values } = parseArgs({
          args: rest.slice(2),
          options: { note: { type: "string" } },
        });
        if (!fingerprint || !["active", "retired"].includes(status)) {
          console.error("Usage: argus memory-status <fingerprint> <active|retired> [--note <text>]");
          return 1;
        }
        const updated = updateGlobalMemory(
          fingerprint,
          status as "active" | "retired",
          values.note,
        );
        console.log(updated ? `Global memory ${fingerprint} is now ${status}.` : "Fingerprint not found.");
        return updated ? 0 : 1;
      }
      case "baseline-import": {
        const source = rest[0];
        if (!source) {
          console.error("Usage: argus baseline-import <report.json>");
          return 1;
        }
        console.log(JSON.stringify(importBaseline(cwd, source), null, 2));
        return 0;
      }
      case "suppress": {
        const id = rest[0];
        const { values } = parseArgs({
          args: rest.slice(1),
          options: {
            reason: { type: "string" },
            expires: { type: "string" },
          },
        });
        if (!id || !values.reason) {
          console.error("Usage: argus suppress <finding-id> --reason <text> [--expires <ISO date>]");
          return 1;
        }
        console.log(JSON.stringify(suppressFinding(cwd, id, values.reason, values.expires), null, 2));
        return 0;
      }
      case "suppressions": {
        const { values } = parseArgs({
          args: rest,
          options: { all: { type: "boolean" } },
        });
        console.log(JSON.stringify(listSuppressions(cwd, !values.all), null, 2));
        return 0;
      }
      case "config-init": {
        const { writeFileSync, existsSync } = await import("node:fs");
        const { join } = await import("node:path");
        const { repoRootSync } = await import("./paths.js");
        const target = join(repoRootSync(cwd), "argus.yaml");
        if (existsSync(target)) {
          console.error(`argus.yaml already exists at ${target}`);
          return 1;
        }
        writeFileSync(target, ARGUS_YAML_TEMPLATE, "utf8");
        console.log(`Created ${target}`);
        return 0;
      }
      case "report": {
        const { values } = parseArgs({
          args: rest,
          options: {
            format: { type: "string" },
            "min-severity": { type: "string" },
            "max-findings": { type: "string" },
          },
        });
        const out = report({
          cwd,
          format: (values.format as "markdown" | "json" | "terminal") ?? "terminal",
          minSeverity: values["min-severity"] as Severity | undefined,
          maxFindings: values["max-findings"] ? Number(values["max-findings"]) : undefined,
        });
        process.stdout.write(out.rendered + "\n");
        if (out.exportPath) console.error(color.dim(`written to ${out.exportPath}`));
        return out.result.findings.some(
          (f) => f.severity === "high" || f.severity === "critical",
        )
          ? 2
          : 0;
      }
      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        return 1;
    }
  } catch (err) {
    console.error(color.red(`Error: ${(err as Error).message}`));
    return 1;
  }
}
