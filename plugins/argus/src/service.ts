import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { repoRootSync, exportsDir } from "./paths.js";
import {
  findingFingerprint,
  GlobalMemory,
  Memory,
  type ReviewerRun,
  type Suppression,
} from "./db.js";
import { buildDiff, isGitRepo } from "./git.js";
import { buildContext } from "./context/builder.js";
import { suggestStackSkills, type StackSkillSuggestion } from "./context/stack-skills.js";
import { rank, sameRootCause } from "./dedup.js";
import { renderMarkdown } from "./report/markdown.js";
import { renderJson } from "./report/json.js";
import { renderTerminal } from "./report/terminal.js";
import { loadConfig, enabledReviewers, isIgnored } from "./config.js";
import { evidencePackageSchema } from "./evidence.js";
import { rootCauseSchema, findingCorrectionSchema, categorySchema, reconciliationSchema, baselineQuerySchema } from "./validation.js";
import { consolidateReconciled, findingsSignature, type ReconciliationGroup } from "./reconciliation.js";
import type { FindingCorrection, RootCause } from "./types.js";
import type { EvidencePackage } from "./types.js";
import type { ReviewResult } from "./report/result.js";
import {
  ALL_CATEGORIES,
  SEVERITY_ORDER,
  type Category,
  type ChallengeResult,
  type Confidence,
  type Finding,
  type Severity,
} from "./types.js";

const SEVERITIES: Severity[] = ["info", "low", "medium", "high", "critical"];
const CONFIDENCES: Confidence[] = ["low", "medium", "high"];

/** Extensions treated as non-reviewable (docs, config, lockfiles, assets). */
const NON_CODE = new Set([
  ".md", ".markdown", ".txt", ".rst", ".lock", ".png", ".jpg", ".jpeg",
  ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".map",
  ".sqlite", ".sqlite3", ".db",
]);
const NON_CODE_NAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "go.sum",
  "Cargo.lock", ".gitignore", "LICENSE", "argus.yaml", "argus.yml",
]);

function isReviewable(p: string): boolean {
  const posix = p.split(path.sep).join("/");
  // Never review Argus's own state, whatever the git/config setup.
  if (posix === ".argus" || posix.startsWith(".argus/")) return false;
  const base = path.basename(p);
  if (NON_CODE_NAMES.has(base)) return false;
  return !NON_CODE.has(path.extname(p).toLowerCase());
}

export interface InitOptions {
  cwd: string;
  base?: string;
  commit?: string;
  paths?: string[];
  includeWorkingTree?: boolean;
}

export interface InitResult {
  repoRoot: string;
  roundId: string;
  baseRef: string;
  overview: string;
  stack: import("./context/stack.js").StackDetection;
  stackSkills: StackSkillSuggestion[];
  changedFiles: {
    path: string;
    status: string;
    reviewable: boolean;
    ignored: boolean;
  }[];
  reviewableFiles: string[];
  /** Files skipped because they matched an `ignore` glob in argus.yaml. */
  ignoredFiles: string[];
  /** Reviewers enabled by argus.yaml, in priority order. */
  enabledReviewers: string[];
  /** Architecture rules declared in argus.yaml (for argus-architecture). */
  architectureRules: string[];
  /** Report defaults derived from argus.yaml. */
  reportDefaults: { minSeverity: string; maxFindings: number };
  /** Path of the loaded argus.yaml, if any. */
  configSource?: string;
  suggestion: string;
}

/** Detect repo, compute diff + context, open a review round in memory. */
export async function initReview(opts: InitOptions): Promise<InitResult> {
  const repoRoot = repoRootSync(opts.cwd);
  if (!(await isGitRepo(repoRoot))) {
    throw new Error(`Not a git repository: ${repoRoot}`);
  }
  const diff = await buildDiff(repoRoot, {
    base: opts.commit ? undefined : opts.base,
    commit: opts.commit,
    paths: opts.paths,
    includeWorkingTree: opts.includeWorkingTree,
  });
  const context = await buildContext(repoRoot, diff);
  const { config, source: configSource } = loadConfig(repoRoot);

  const mem = Memory.open(repoRoot);
  try {
    const round = mem.createRound(diff.baseRef, context.overview);
    const changedFiles = diff.files.map((f) => {
      const ignored = isIgnored(f.path, config.ignore);
      return {
        path: f.path,
        status: f.status,
        // A file counts as reviewable only if it is code AND not ignored.
        reviewable: isReviewable(f.path) && !ignored,
        ignored,
      };
    });
    const reviewableFiles = changedFiles
      .filter((f) => f.reviewable)
      .map((f) => f.path);
    const ignoredFiles = changedFiles
      .filter((f) => f.ignored)
      .map((f) => f.path);
    const reviewers = enabledReviewers(config);

    const suggestion =
      reviewableFiles.length === 0
        ? "No reviewable code changed (only docs/config/assets/ignored). No reviewers needed."
        : `Enabled reviewers [${reviewers.join(", ")}] over: ${reviewableFiles.join(", ")}`;

    return {
      repoRoot,
      roundId: round.id,
      baseRef: diff.baseRef,
      overview: context.overview,
      stack: context.metadata.stack,
      stackSkills: suggestStackSkills(context.metadata.stack, reviewableFiles, reviewers),
      changedFiles,
      reviewableFiles,
      ignoredFiles,
      enabledReviewers: reviewers,
      architectureRules: config.architecture.rules,
      reportDefaults: {
        minSeverity: config.severity.minimum,
        maxFindings: config.review.max_findings,
      },
      configSource,
      suggestion,
    };
  } finally {
    mem.close();
  }
}

export interface FindingInput {
  reviewer: string;
  category: string;
  severity?: string;
  confidence?: string;
  title: string;
  file: string;
  start_line?: number;
  end_line?: number;
  description: string;
  evidence?: string[];
  impact: string;
  scenario?: string;
  recommendation?: string;
  evidencePackage?: EvidencePackage;
  rootCause?: RootCause;
}

function coerce(input: FindingInput): Finding {
  for (const [field, value] of [
    ["reviewer", input.reviewer],
    ["title", input.title],
    ["file", input.file],
    ["description", input.description],
    ["impact", input.impact],
  ] as const) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Finding field ${field} must be a non-empty string.`);
    }
  }
  if (path.isAbsolute(input.file) || input.file.split(/[\\/]/).includes("..")) {
    throw new Error("Finding file must be a repository-relative path.");
  }
  if (!Array.isArray(input.evidence) || !input.evidence.some((item) => String(item).trim())) {
    throw new Error("A finding must contain at least one concrete evidence item.");
  }
  const category = categorySchema.parse(input.category);
  const severity = SEVERITIES.includes(input.severity as Severity)
    ? (input.severity as Severity)
    : "medium";
  const confidence = CONFIDENCES.includes(input.confidence as Confidence)
    ? (input.confidence as Confidence)
    : "medium";
  const start = Number(input.start_line);
  const end = Number(input.end_line);
  const lines =
    Number.isFinite(start) && start > 0
      ? { start, end: Number.isFinite(end) && end >= start ? end : start }
      : undefined;
  return {
    id: randomUUID(),
    title: input.title,
    category,
    severity,
    confidence,
    file: input.file,
    lines,
    description: input.description ?? "",
    evidence: input.evidence.map(String).filter((item) => item.trim().length > 0),
    evidencePackage: input.evidencePackage === undefined ? undefined
      : evidencePackageSchema.parse(input.evidencePackage),
    rootCause: input.rootCause === undefined ? undefined : rootCauseSchema.parse(input.rootCause),
    impact: input.impact ?? "",
    scenario: input.scenario,
    recommendation: input.recommendation,
    reviewer: input.reviewer,
    status: "candidate",
    detectedBy: [input.reviewer],
  };
}

function withCurrentRound<T>(
  cwd: string,
  fn: (mem: Memory, roundId: string) => T,
  requireActive = false,
): T {
  const repoRoot = repoRootSync(cwd);
  const mem = Memory.open(repoRoot);
  try {
    const round = mem.activeRound();
    if (!round) {
      throw new Error("No active review round. Run argus_init / `argus init` first.");
    }
    if (requireActive && round.status !== "active") {
      throw new Error("The current review round is already reported. Run argus_init to start a new round.");
    }
    return fn(mem, round.id);
  } finally {
    mem.close();
  }
}

export interface RecordFindingResult {
  id: string;
  similar: { id: string; title: string; file: string }[];
}

export function recordFinding(cwd: string, input: FindingInput): RecordFindingResult {
  return withCurrentRound(cwd, (mem, roundId) => {
    const finding = coerce(input);
    // Dedupe hint: surface similar existing findings in the same file.
    const existing = mem.listFindings(roundId);
    const similar = existing
      .filter((e) => e.file === finding.file && titleSim(e.title, finding.title) >= 0.5)
      .map((e) => ({ id: e.id, title: e.title, file: e.file }));
    mem.recordFinding(roundId, finding);
    return { id: finding.id, similar };
  }, true);
}

export function recordChallenge(
  cwd: string,
  findingId: string,
  result: ChallengeResult,
  reasoning: string,
  evidencePackage?: EvidencePackage,
  correction?: FindingCorrection,
  rootCause?: RootCause,
): boolean {
  if (!["CONFIRMED", "PLAUSIBLE", "REJECTED"].includes(result) || !reasoning.trim()) {
    throw new Error("Challenge requires a valid verdict and non-empty reasoning.");
  }
  const packet = evidencePackage === undefined ? undefined : evidencePackageSchema.parse(evidencePackage);
  const corrected = correction === undefined ? undefined : findingCorrectionSchema.parse(correction);
  const cause = rootCause === undefined ? undefined : rootCauseSchema.parse(rootCause);
  if (corrected && result === "REJECTED") throw new Error("Correct surviving findings; reject invalid ones without a correction.");
  return withCurrentRound(cwd, (mem, roundId) =>
    mem.updateChallenge(roundId, findingId, result, reasoning, packet, corrected, cause), true);
}

export function recordReviewerRun(
  cwd: string,
  reviewer: string,
  status: ReviewerRun["status"],
  detail?: string,
): void {
  withCurrentRound(cwd, (mem, roundId) => {
    mem.recordReviewerRun(roundId, reviewer, status, detail);
  }, true);
}

export function listFindings(cwd: string, status?: string): Finding[] {
  return withCurrentRound(cwd, (mem, roundId) => {
    const all = mem.listFindings(roundId);
    return status ? all.filter((f) => f.status === status) : all;
  });
}

export function querySimilar(
  cwd: string,
  query: { title?: string; file?: string },
): Finding[] {
  return withCurrentRound(cwd, (mem, roundId) => {
    const all = mem.listFindings(roundId);
    return all.filter((f) => {
      const fileMatch = query.file ? f.file === query.file : true;
      const titleMatch = query.title ? titleSim(f.title, query.title) >= 0.4 : true;
      return fileMatch && titleMatch;
    });
  });
}

export function memorySearch(
  cwd: string,
  query: string,
  limit = 20,
): {
  local: Finding[];
  global: Array<{
    fingerprint: string;
    target: string;
    finding: Finding;
    status: "active" | "retired";
    note?: string;
  }>;
} {
  const repoRoot = repoRootSync(cwd);
  const mem = Memory.open(repoRoot);
  const global = GlobalMemory.open();
  try {
    return {
      local: mem.searchFindings(query, limit),
      global: global.search(query, limit),
    };
  } finally {
    mem.close();
    global.close();
  }
}

export function updateGlobalMemory(
  fingerprint: string,
  status: "active" | "retired",
  note?: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Invalid global-memory fingerprint.");
  const global = GlobalMemory.open();
  try {
    return global.updateStatus(fingerprint, status, note?.trim() || undefined);
  } finally {
    global.close();
  }
}

export function importBaseline(cwd: string, source: string): { source: string; imported: number } {
  const repoRoot = repoRootSync(cwd);
  const sourcePath = path.resolve(repoRoot, source);
  const relative = path.relative(repoRoot, sourcePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Baseline file must be inside the repository.");
  }
  const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as unknown;
  const rawFindings = Array.isArray(parsed)
    ? parsed
    : isObject(parsed) && Array.isArray(parsed.findings)
      ? parsed.findings
      : undefined;
  if (!rawFindings) throw new Error("Baseline must be an Argus JSON report or an array of findings.");
  const findings = rawFindings.map(parseBaselineFinding);
  const mem = Memory.open(repoRoot);
  try {
    return { source: relative.split(path.sep).join("/"), imported: mem.importBaseline(relative, findings) };
  } finally {
    mem.close();
  }
}

export function suppressFinding(
  cwd: string,
  findingId: string,
  reason: string,
  expiresAt?: string,
): Suppression {
  if (!reason.trim()) throw new Error("Suppression reason must not be empty.");
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("Suppression expiry must be a valid ISO date/time.");
  }
  const normalizedExpiry = expiresAt ? new Date(expiresAt).toISOString() : undefined;
  return withCurrentRound(cwd, (mem) => {
    const finding = mem.getFinding(findingId);
    if (!finding) throw new Error(`No finding with id ${findingId}.`);
    return mem.suppressFinding(finding, reason.trim(), normalizedExpiry);
  });
}

export function listSuppressions(cwd: string, activeOnly = true): Suppression[] {
  const mem = Memory.open(repoRootSync(cwd));
  try {
    return mem.listSuppressions(activeOnly);
  } finally {
    mem.close();
  }
}

export function reconcileFindings(cwd: string, input: ReconciliationGroup[]) {
  const groups = reconciliationSchema.parse(input);
  return withCurrentRound(cwd, (mem, roundId) => {
    const all = mem.listFindings(roundId);
    const result = consolidateReconciled(all, groups);
    const history = baselineHistory(mem, roundId);
    attachBaselineLinks(result.findings, groups, history);
    mem.setMeta(`reconciliation:${roundId}`, JSON.stringify({ signature: findingsSignature(all), groups }));
    return { groups: result.findings.length, duplicatesMerged: result.removed,
      appliedGroups: result.findings.map(f => ({
        canonicalId: f.id,
        memberIds: f.consolidation?.memberIds ?? [f.id],
        baselineIdentity: f.baselineIdentity,
        baselineStatus: baselineStatus(f, history),
        matchMode: f.baselineMatch ? "explicit" : baselineStatus(f, history) === "new" ? "none" : "automatic",
        baselineMatch: f.baselineMatch ?? null,
        incorporatedBaselines: f.baselineIncorporations ?? [],
      })) };
  }, true);
}

function baselineHistory(mem: Memory, roundId: string) {
  return {
    previous: mem.previousReportedFindings(roundId),
    historical: mem.olderConfirmedFindings(roundId),
    imported: mem.listBaselineFindings(),
  };
}

export function listBaselineFindings(cwd: string) {
  return withCurrentRound(cwd, (mem, roundId) => baselineHistory(mem, roundId));
}

/** Bounded summaries by default; retrieve evidence for one exact historical ID. */
export function queryBaselineFindings(cwd: string, input: {
  file?: string; symbol?: string; finding_id?: string; offset?: number; limit?: number;
} = {}) {
  const opts = baselineQuerySchema.parse(input);
  const history = listBaselineFindings(cwd);
  const seen = new Set<string>();
  const entries = Object.entries(history).flatMap(([source, findings]) => findings.flatMap(f => {
    if (seen.has(f.id)) return [];
    seen.add(f.id);
    if (opts.file && f.file !== opts.file || opts.symbol && f.rootCause?.symbol !== opts.symbol || opts.finding_id && f.id !== opts.finding_id) return [];
    return [{ source, finding: f }];
  }));
  const page = entries.slice(opts.offset, opts.offset + opts.limit);
  const nextOffset = opts.offset + page.length < entries.length ? opts.offset + page.length : null;
  return { total: entries.length, offset: opts.offset, limit: opts.limit, hasMore: nextOffset !== null, nextOffset,
    findings: page.map(({ source, finding: f }) => opts.finding_id
      ? { source, ...f }
      : { source, id: f.id, baselineIdentity: f.baselineIdentity ?? f.id,
          title: f.title, file: f.file, category: f.category, severity: f.severity, rootCause: f.rootCause }),
  };
}

function baselineStatus(finding: Finding, history: ReturnType<typeof baselineHistory>) {
  return matchFinding(finding, history.previous) || matchFinding(finding, history.imported)
    ? "persistent" as const : matchFinding(finding, history.historical) ? "regression" as const : "new" as const;
}

function attachBaselineLinks(findings: Finding[], groups: ReconciliationGroup[], history: ReturnType<typeof baselineHistory>): void {
  const candidates = [...history.previous, ...history.historical, ...history.imported];
  const used = new Set<string>();
  for (const finding of findings) {
    const link = groups.find(g => g.canonical_id === finding.id)?.baseline_match;
    const candidate = link ? candidates.find(f => f.id === link.finding_id)
      : candidates.find(f => matchFinding(finding, [f]));
    if (link && (!candidate || candidate.file !== finding.file)) throw new Error("Baseline match must reference an existing historical finding in the same file.");
    const identity = candidate?.baselineIdentity ?? candidate?.id ?? finding.id;
    if (used.has(identity)) throw new Error("Different current defects cannot claim the same baseline identity.");
    used.add(identity);
    finding.baselineIdentity = identity;
    if (link) finding.baselineMatch = { findingId: candidate!.id, reasoning: link.reasoning };
  }
  for (const finding of findings) {
    const links = groups.find(g => g.canonical_id === finding.id)?.incorporated_baselines ?? [];
    finding.baselineIncorporations = links.map(link => {
      const candidate = candidates.find(f => f.id === link.finding_id);
      if (!candidate || candidate.file !== finding.file) throw new Error("Incorporation must reference an existing historical finding in the same file.");
      const identity = candidate.baselineIdentity ?? candidate.id;
      if (used.has(identity)) throw new Error("An incorporated identity cannot also be matched or incorporated by another group.");
      used.add(identity);
      return { findingId: candidate.id, baselineIdentity: identity, title: candidate.title,
        reasoning: link.reasoning, coveredClaims: link.covered_claims };
    });
  }
}

export interface ReportOptions {
  cwd: string;
  format?: "markdown" | "json" | "terminal";
  minSeverity?: Severity;
  maxFindings?: number;
  write?: boolean;
  /** Disable cross-target promotion in isolated tests. */
  promoteGlobal?: boolean;
}

export interface ReportOutput {
  result: ReviewResult;
  rendered: string;
  exportPath?: string;
}

export function report(opts: ReportOptions): ReportOutput {
  const repoRoot = repoRootSync(opts.cwd);
  const mem = Memory.open(repoRoot);
  try {
    const round = mem.activeRound();
    if (!round) throw new Error("No active review round.");
    const all = mem.listFindings(round.id);

    const pending = all.filter((f) => f.status === "candidate");
    if (pending.length > 0) {
      throw new Error(
        `Cannot generate report: ${pending.length} candidate finding(s) still require Challenger verdicts.`,
      );
    }

    const reviewerRuns = mem.listReviewerRuns(round.id);
    const running = reviewerRuns.filter(r => r.status === "started");
    if (running.length) throw new Error(`Cannot generate report: reviewers still started: ${running.map(r => r.reviewer).join(", ")}. Record completed or failed before reporting.`);
    const rejectedCount = all.filter((f) => f.status === "rejected").length;
    const stored = mem.getMeta(`reconciliation:${round.id}`);
    if (!stored) throw new Error("Run argus_reconcile / argus reconcile before reporting, including zero-finding rounds.");
    const reconciliation = JSON.parse(stored) as { signature: string; groups: ReconciliationGroup[] };
    if (reconciliation.signature !== findingsSignature(all)) throw new Error("Findings changed after reconciliation; run argus_reconcile again.");
    const { findings: deduped, removed } = consolidateReconciled(all, reconciliationSchema.parse(reconciliation.groups));
    const history = baselineHistory(mem, round.id);
    attachBaselineLinks(deduped, reconciliation.groups, history);
    const previous = history.previous;
    const classified = deduped.map((finding) => ({
      ...finding,
      baselineStatus: baselineStatus(finding, history),
    }));
    const incorporatedBaselineFindings = classified.flatMap(f => (f.baselineIncorporations ?? []).map(link => ({
      ...link, file: f.file, intoFindingId: f.id,
    })));
    const incorporatedIdentities = new Set(incorporatedBaselineFindings.map(f => f.baselineIdentity));
    const unmatchedPreviousFindings = previous
      .filter((finding) => !incorporatedIdentities.has(finding.baselineIdentity ?? finding.id) && !matchFinding(finding, classified))
      .map(({ title, file, severity, category }) => ({ title, file, severity, category }));
    const activeSuppressions = new Set(mem.listSuppressions(true).map((item) => item.fingerprint));
    const unsuppressed = classified.filter(
      (finding) => !activeSuppressions.has(findingFingerprint(finding)),
    );
    const suppressedCount = classified.length - unsuppressed.length;
    const ranked = rank(unsuppressed);

    // Defaults come from argus.yaml unless the caller overrides them.
    const { config } = loadConfig(repoRoot);
    const floor = opts.minSeverity ?? config.severity.minimum;
    const max = opts.maxFindings ?? config.review.max_findings;
    if (!SEVERITIES.includes(floor)) {
      throw new Error(`Invalid minimum severity: ${String(floor)}`);
    }
    if (!Number.isInteger(max) || max <= 0 || max > 500) {
      throw new Error(`maxFindings must be an integer between 1 and 500; got ${String(max)}`);
    }
    const filtered = ranked
      .filter((f) => SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER[floor])
      .slice(0, max);

    const reviewers = Array.from(new Set([
      ...reviewerRuns.map((r) => r.reviewer),
      ...all.map((f) => f.reviewer),
    ]));
    const result: ReviewResult = {
      baseRef: round.baseRef,
      projectSummary: round.projectSummary,
      reviewersRun: reviewers,
      candidateCount: all.length,
      rejectedCount,
      duplicatesRemoved: removed,
      suppressedCount,
      resolvedCount: 0,
      unmatchedPreviousCount: unmatchedPreviousFindings.length,
      unmatchedPreviousFindings,
      incorporatedBaselineCount: incorporatedBaselineFindings.length,
      incorporatedBaselineFindings,
      findings: filtered,
      reviewerStats: reviewers.map((r) => ({
        reviewer: r,
        candidates: all.filter((f) => f.reviewer === r).length,
        status: reviewerRuns.find((run) => run.reviewer === r)?.status ?? "untracked",
        detail: reviewerRuns.find((run) => run.reviewer === r)?.detail,
      })),
      resolvedFindings: [],
    };

    const format = opts.format ?? "terminal";
    const rendered =
      format === "json"
        ? renderJson(result)
        : format === "markdown"
          ? renderMarkdown(result)
          : renderTerminal(result);

    let exportPath: string | undefined;
    if (opts.write !== false) {
      const dir = exportsDir(repoRoot);
      fs.mkdirSync(dir, { recursive: true });
      const ext = format === "json" ? "json" : "md";
      exportPath = path.join(dir, `report-${round.id}.${ext}`);
      const body =
        format === "json" ? rendered : renderMarkdown(result);
      fs.writeFileSync(exportPath, body, "utf8");
    }

    if (opts.promoteGlobal !== false) {
      const global = GlobalMemory.open();
      try {
        for (const finding of unsuppressed) {
          if (finding.challenge?.result === "CONFIRMED") {
            global.addFinding(path.basename(repoRoot), finding);
          }
        }
      } finally {
        global.close();
      }
    }

    mem.setMeta(`reported-findings:${round.id}`, JSON.stringify(classified));
    mem.setRoundStatus(round.id, "reported");
    return { result, rendered, exportPath };
  } finally {
    mem.close();
  }
}

function matchFinding(finding: Finding, candidates: Finding[]): boolean {
  const fingerprint = findingFingerprint(finding);
  return candidates.some((candidate) => {
    if (candidate.file !== finding.file) return false;
    if (finding.baselineIdentity && finding.baselineIdentity === (candidate.baselineIdentity ?? candidate.id)) return true;
    if (candidate.baselineIdentity && candidate.baselineIdentity === finding.id) return true;
    if (candidate.rootCauseValidated && finding.rootCauseValidated && candidate.rootCause && finding.rootCause) return sameRootCause(candidate, finding);
    return findingFingerprint(candidate) === fingerprint ||
      (candidate.category === finding.category && titleSim(candidate.title, finding.title) >= 0.75);
  });
}

function parseBaselineFinding(value: unknown): Finding {
  if (!isObject(value)) throw new Error("Baseline contains a non-object finding.");
  const required = ["title", "file", "category", "severity"] as const;
  for (const field of required) {
    if (typeof value[field] !== "string" || !value[field].trim()) {
      throw new Error(`Baseline finding is missing ${field}.`);
    }
  }
  if (!(ALL_CATEGORIES as string[]).includes(value.category as string)) {
    throw new Error(`Invalid baseline category: ${String(value.category)}`);
  }
  if (!SEVERITIES.includes(value.severity as Severity)) {
    throw new Error(`Invalid baseline severity: ${String(value.severity)}`);
  }
  return {
    id: typeof value.id === "string" ? value.id : randomUUID(),
    title: value.title as string,
    file: value.file as string,
    category: value.category as Category,
    severity: value.severity as Severity,
    confidence: CONFIDENCES.includes(value.confidence as Confidence)
      ? value.confidence as Confidence
      : "medium",
    description: typeof value.description === "string" ? value.description : "Imported baseline finding.",
    evidence: Array.isArray(value.evidence) ? value.evidence.map(String) : [],
    evidencePackage: value.evidencePackage === undefined ? undefined
      : evidencePackageSchema.parse(value.evidencePackage),
    rootCause: value.rootCause === undefined ? undefined : rootCauseSchema.parse(value.rootCause),
    rootCauseValidated: value.rootCauseValidated === true,
    baselineIdentity: typeof value.baselineIdentity === "string" && value.baselineIdentity.trim()
      ? value.baselineIdentity : undefined,
    impact: typeof value.impact === "string" ? value.impact : "Previously reported.",
    reviewer: typeof value.reviewer === "string" ? value.reviewer : "baseline",
    status: "confirmed",
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Cheap token-overlap similarity on two titles. */
function titleSim(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}
