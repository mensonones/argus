import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  initReview,
  recordFinding,
  recordChallenge,
  recordReviewerRun,
  listFindings,
  querySimilar,
  memorySearch,
  importBaseline,
  suppressFinding,
  listSuppressions,
  updateGlobalMemory,
  report,
} from "./service.js";
import type { Severity } from "./types.js";
import { ARGUS_VERSION } from "./version.js";
import { evidencePackageSchema } from "./evidence.js";
import { rootCauseSchema, findingCorrectionSchema } from "./validation.js";

const SERVER_CWD = process.cwd();
let activeCwd: string | undefined;

function targetCwd(): string {
  if (!activeCwd) {
    throw new Error("Call argus_init before using review-round tools.");
  }
  return activeCwd;
}

function text(value: unknown) {
  const body =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text: body }] };
}

function errorText(err: unknown) {
  return {
    isError: true,
    content: [
      { type: "text" as const, text: `Error: ${(err as Error).message}` },
    ],
  };
}

export async function startServer(): Promise<void> {
  const server = new McpServer({ name: "argus", version: ARGUS_VERSION });

  server.registerTool(
    "argus_init",
    {
      title: "Initialize a review round",
      description:
        "Detect the git repository, compute the diff (vs a base branch, a " +
        "commit, or specific paths), build project context, and open a review " +
        "round in memory. Call this first. Returns changed files, which are " +
        "reviewable (code vs docs/assets), and a project overview to hand to " +
        "the specialist reviewers.",
      inputSchema: {
        repo_path: z
          .string()
          .optional()
          .describe("Absolute path of the git repository being reviewed"),
        base: z.string().optional().describe("Base ref to diff against"),
        commit: z.string().optional().describe("Review a single commit"),
        paths: z.array(z.string()).optional().describe("Limit to these paths"),
        includeWorkingTree: z
          .boolean()
          .optional()
          .describe("Include staged, unstaged, and untracked changes (default: true)"),
      },
    },
    async (args) => {
      try {
        const { repo_path, ...options } = args;
        const result = await initReview({ cwd: repo_path ?? SERVER_CWD, ...options });
        activeCwd = result.repoRoot;
        return text(result);
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_record_reviewer_run",
    {
      title: "Record reviewer execution",
      description:
        "Record that a specialist reviewer started, completed, or failed. " +
        "The final report uses this for truthful coverage even when a reviewer finds nothing.",
      inputSchema: {
        reviewer: z.string(),
        status: z.enum(["started", "completed", "failed"]),
        detail: z.string().optional(),
      },
    },
    async (args) => {
      try {
        recordReviewerRun(targetCwd(), args.reviewer, args.status, args.detail);
        return text(`Recorded ${args.reviewer}: ${args.status}.`);
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_record_finding",
    {
      title: "Record a candidate finding",
      description:
        "A specialist reviewer records one candidate finding into the active " +
        "round. Returns the finding id and any similar existing findings " +
        "(same file, similar title) so you can avoid duplicates. Only report " +
        "evidence-backed findings, never speculation or style nits.",
      inputSchema: {
        reviewer: z
          .string().min(1)
          .describe("Reviewer id: correctness|security|performance|architecture"),
        category: z
          .enum(["correctness", "security", "performance", "architecture", "tests"])
          .optional(),
        severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
        confidence: z.enum(["low", "medium", "high"]).optional(),
        title: z.string().min(1),
        file: z.string().min(1),
        start_line: z.number().optional(),
        end_line: z.number().optional(),
        description: z.string().min(1),
        evidence: z.array(z.string().min(1)).min(1),
        evidencePackage: evidencePackageSchema.optional(),
        rootCause: rootCauseSchema.optional(),
        impact: z.string().min(1),
        scenario: z.string().optional(),
        recommendation: z.string().optional(),
      },
    },
    async (args) => {
      try {
        return text(recordFinding(targetCwd(), args));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_record_challenge",
    {
      title: "Record a challenge verdict",
      description:
        "The Challenger records its verdict for a finding after trying to " +
        "prove it wrong. CONFIRMED or PLAUSIBLE keep the finding; REJECTED " +
        "removes it from the report. Validate/reuse rootCause for the same defect. " +
        "Use correction to replace unsupported claim-bearing content; replace " +
        "the existing evidencePackage too. Originals remain in the audit history.",
      inputSchema: {
        finding_id: z.string(),
        verdict: z.enum(["CONFIRMED", "PLAUSIBLE", "REJECTED"]),
        reasoning: z.string().trim().min(1),
        evidencePackage: evidencePackageSchema.optional(),
        rootCause: rootCauseSchema.optional(),
        correction: findingCorrectionSchema.optional(),
      },
    },
    async (args) => {
      try {
        const ok = recordChallenge(targetCwd(), args.finding_id, args.verdict, args.reasoning, args.evidencePackage, args.correction, args.rootCause);
        return text(
          ok
            ? `Recorded ${args.verdict} for ${args.finding_id}.`
            : `No finding with id ${args.finding_id}.`,
        );
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_list_findings",
    {
      title: "List findings in the active round",
      description:
        "List findings recorded so far, optionally filtered by status " +
        "(candidate|confirmed|rejected). Use to coordinate reviewers and see " +
        "what still needs challenging.",
      inputSchema: {
        status: z.enum(["candidate", "confirmed", "rejected"]).optional(),
      },
    },
    async (args) => {
      try {
        return text(listFindings(targetCwd(), args.status));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_query_similar",
    {
      title: "Find similar existing findings",
      description:
        "Before recording, check whether a similar finding already exists " +
        "(dedupe). Match by file and/or title.",
      inputSchema: {
        title: z.string().optional(),
        file: z.string().optional(),
      },
    },
    async (args) => {
      try {
        return text(querySimilar(targetCwd(), args));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_memory_search",
    {
      title: "Search past findings (memory)",
      description:
        "Broad text search across all findings ever recorded for this target, " +
        "including previous rounds. Use to recall prior work and avoid repeats.",
      inputSchema: {
        query: z.string(),
        limit: z.number().optional(),
      },
    },
    async (args) => {
      try {
        return text(memorySearch(targetCwd(), args.query, args.limit));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_import_baseline",
    {
      title: "Import a previous Argus report as baseline",
      description:
        "Import an Argus JSON report stored inside the repository. Future reports " +
        "classify matching findings as persistent instead of new.",
      inputSchema: { source: z.string().min(1) },
    },
    async (args) => {
      try {
        return text(importBaseline(targetCwd(), args.source));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_update_global_memory",
    {
      title: "Activate or retire a global-memory finding",
      description:
        "Maintain the cross-project memory lifecycle. Retired entries stop " +
        "appearing in normal memory searches but remain auditable in SQLite.",
      inputSchema: {
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        status: z.enum(["active", "retired"]),
        note: z.string().optional(),
      },
    },
    async (args) => {
      try {
        return text({ updated: updateGlobalMemory(args.fingerprint, args.status, args.note) });
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_suppress_finding",
    {
      title: "Suppress a known finding",
      description:
        "Suppress a finding by stable fingerprint with a required audit reason " +
        "and optional ISO expiry. Matching findings are omitted from later reports.",
      inputSchema: {
        finding_id: z.string().min(1),
        reason: z.string().min(1),
        expires_at: z.string().optional(),
      },
    },
    async (args) => {
      try {
        return text(suppressFinding(targetCwd(), args.finding_id, args.reason, args.expires_at));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_list_suppressions",
    {
      title: "List finding suppressions",
      description: "List active suppressions, or include expired entries for audit.",
      inputSchema: { include_expired: z.boolean().optional() },
    },
    async (args) => {
      try {
        return text(listSuppressions(targetCwd(), !args.include_expired));
      } catch (err) {
        return errorText(err);
      }
    },
  );

  server.registerTool(
    "argus_report",
    {
      title: "Deduplicate, rank, and render the final report",
      description:
        "Consolidate duplicate findings, rank them (severity × confidence × " +
        "evidence × agreement), apply the severity floor and max-findings cap, " +
        "render the report, and write it to .argus/exports/. Call this last.",
      inputSchema: {
        format: z.enum(["markdown", "json", "terminal"]).optional(),
        min_severity: z
          .enum(["info", "low", "medium", "high", "critical"])
          .optional(),
        max_findings: z.number().optional(),
      },
    },
    async (args) => {
      try {
        const out = report({
          cwd: targetCwd(),
          format: args.format,
          minSeverity: args.min_severity as Severity | undefined,
          maxFindings: args.max_findings,
        });
        const suffix = out.exportPath ? `\n\n(written to ${out.exportPath})` : "";
        return text(out.rendered + suffix);
      } catch (err) {
        return errorText(err);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
