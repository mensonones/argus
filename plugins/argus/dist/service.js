import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { repoRootSync, exportsDir } from "./paths.js";
import { findingFingerprint, GlobalMemory, Memory, } from "./db.js";
import { buildDiff, isGitRepo } from "./git.js";
import { buildContext } from "./context/builder.js";
import { deduplicate, rank } from "./dedup.js";
import { renderMarkdown } from "./report/markdown.js";
import { renderJson } from "./report/json.js";
import { renderTerminal } from "./report/terminal.js";
import { loadConfig, enabledReviewers, isIgnored } from "./config.js";
import { evidencePackageSchema } from "./evidence.js";
import { ALL_CATEGORIES, SEVERITY_ORDER, } from "./types.js";
const SEVERITIES = ["info", "low", "medium", "high", "critical"];
const CONFIDENCES = ["low", "medium", "high"];
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
function isReviewable(p) {
    const posix = p.split(path.sep).join("/");
    // Never review Argus's own state, whatever the git/config setup.
    if (posix === ".argus" || posix.startsWith(".argus/"))
        return false;
    const base = path.basename(p);
    if (NON_CODE_NAMES.has(base))
        return false;
    return !NON_CODE.has(path.extname(p).toLowerCase());
}
/** Detect repo, compute diff + context, open a review round in memory. */
export async function initReview(opts) {
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
        const suggestion = reviewableFiles.length === 0
            ? "No reviewable code changed (only docs/config/assets/ignored). No reviewers needed."
            : `Enabled reviewers [${reviewers.join(", ")}] over: ${reviewableFiles.join(", ")}`;
        return {
            repoRoot,
            roundId: round.id,
            baseRef: diff.baseRef,
            overview: context.overview,
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
    }
    finally {
        mem.close();
    }
}
function coerce(input) {
    for (const [field, value] of [
        ["reviewer", input.reviewer],
        ["title", input.title],
        ["file", input.file],
        ["description", input.description],
        ["impact", input.impact],
    ]) {
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
    const category = ALL_CATEGORIES.includes(input.category ?? "")
        ? input.category
        : "correctness";
    const severity = SEVERITIES.includes(input.severity)
        ? input.severity
        : "medium";
    const confidence = CONFIDENCES.includes(input.confidence)
        ? input.confidence
        : "medium";
    const start = Number(input.start_line);
    const end = Number(input.end_line);
    const lines = Number.isFinite(start) && start > 0
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
        impact: input.impact ?? "",
        scenario: input.scenario,
        recommendation: input.recommendation,
        reviewer: input.reviewer,
        status: "candidate",
        detectedBy: [input.reviewer],
    };
}
function withCurrentRound(cwd, fn, requireActive = false) {
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
    }
    finally {
        mem.close();
    }
}
export function recordFinding(cwd, input) {
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
export function recordChallenge(cwd, findingId, result, reasoning, evidencePackage) {
    if (!["CONFIRMED", "PLAUSIBLE", "REJECTED"].includes(result) || !reasoning.trim()) {
        throw new Error("Challenge requires a valid verdict and non-empty reasoning.");
    }
    const packet = evidencePackage === undefined ? undefined : evidencePackageSchema.parse(evidencePackage);
    return withCurrentRound(cwd, (mem, roundId) => mem.updateChallenge(roundId, findingId, result, reasoning, packet), true);
}
export function recordReviewerRun(cwd, reviewer, status, detail) {
    withCurrentRound(cwd, (mem, roundId) => {
        mem.recordReviewerRun(roundId, reviewer, status, detail);
    }, true);
}
export function listFindings(cwd, status) {
    return withCurrentRound(cwd, (mem, roundId) => {
        const all = mem.listFindings(roundId);
        return status ? all.filter((f) => f.status === status) : all;
    });
}
export function querySimilar(cwd, query) {
    return withCurrentRound(cwd, (mem, roundId) => {
        const all = mem.listFindings(roundId);
        return all.filter((f) => {
            const fileMatch = query.file ? f.file === query.file : true;
            const titleMatch = query.title ? titleSim(f.title, query.title) >= 0.4 : true;
            return fileMatch && titleMatch;
        });
    });
}
export function memorySearch(cwd, query, limit = 20) {
    const repoRoot = repoRootSync(cwd);
    const mem = Memory.open(repoRoot);
    const global = GlobalMemory.open();
    try {
        return {
            local: mem.searchFindings(query, limit),
            global: global.search(query, limit),
        };
    }
    finally {
        mem.close();
        global.close();
    }
}
export function updateGlobalMemory(fingerprint, status, note) {
    if (!/^[a-f0-9]{64}$/.test(fingerprint))
        throw new Error("Invalid global-memory fingerprint.");
    const global = GlobalMemory.open();
    try {
        return global.updateStatus(fingerprint, status, note?.trim() || undefined);
    }
    finally {
        global.close();
    }
}
export function importBaseline(cwd, source) {
    const repoRoot = repoRootSync(cwd);
    const sourcePath = path.resolve(repoRoot, source);
    const relative = path.relative(repoRoot, sourcePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Baseline file must be inside the repository.");
    }
    const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    const rawFindings = Array.isArray(parsed)
        ? parsed
        : isObject(parsed) && Array.isArray(parsed.findings)
            ? parsed.findings
            : undefined;
    if (!rawFindings)
        throw new Error("Baseline must be an Argus JSON report or an array of findings.");
    const findings = rawFindings.map(parseBaselineFinding);
    const mem = Memory.open(repoRoot);
    try {
        return { source: relative.split(path.sep).join("/"), imported: mem.importBaseline(relative, findings) };
    }
    finally {
        mem.close();
    }
}
export function suppressFinding(cwd, findingId, reason, expiresAt) {
    if (!reason.trim())
        throw new Error("Suppression reason must not be empty.");
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
        throw new Error("Suppression expiry must be a valid ISO date/time.");
    }
    const normalizedExpiry = expiresAt ? new Date(expiresAt).toISOString() : undefined;
    return withCurrentRound(cwd, (mem) => {
        const finding = mem.getFinding(findingId);
        if (!finding)
            throw new Error(`No finding with id ${findingId}.`);
        return mem.suppressFinding(finding, reason.trim(), normalizedExpiry);
    });
}
export function listSuppressions(cwd, activeOnly = true) {
    const mem = Memory.open(repoRootSync(cwd));
    try {
        return mem.listSuppressions(activeOnly);
    }
    finally {
        mem.close();
    }
}
export function report(opts) {
    const repoRoot = repoRootSync(opts.cwd);
    const mem = Memory.open(repoRoot);
    try {
        const round = mem.activeRound();
        if (!round)
            throw new Error("No active review round.");
        const all = mem.listFindings(round.id);
        const pending = all.filter((f) => f.status === "candidate");
        if (pending.length > 0) {
            throw new Error(`Cannot generate report: ${pending.length} candidate finding(s) still require Challenger verdicts.`);
        }
        const rejectedCount = all.filter((f) => f.status === "rejected").length;
        const survivors = all.filter((f) => f.status === "confirmed");
        const { findings: deduped, removed } = deduplicate(survivors);
        const previous = deduplicate(mem.previousReportedFindings(round.id)).findings;
        const older = deduplicate(mem.olderConfirmedFindings(round.id)).findings;
        const imported = deduplicate(mem.listBaselineFindings()).findings;
        const classified = deduped.map((finding) => ({
            ...finding,
            baselineStatus: matchFinding(finding, previous)
                ? "persistent"
                : matchFinding(finding, imported)
                    ? "persistent"
                    : matchFinding(finding, older)
                        ? "regression"
                        : "new",
        }));
        const resolvedFindings = previous
            .filter((finding) => !matchFinding(finding, classified))
            .map(({ title, file, severity, category }) => ({ title, file, severity, category }));
        const activeSuppressions = new Set(mem.listSuppressions(true).map((item) => item.fingerprint));
        const unsuppressed = classified.filter((finding) => !activeSuppressions.has(findingFingerprint(finding)));
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
        const reviewerRuns = mem.listReviewerRuns(round.id);
        const reviewers = Array.from(new Set([
            ...reviewerRuns.map((r) => r.reviewer),
            ...all.map((f) => f.reviewer),
        ]));
        const result = {
            baseRef: round.baseRef,
            projectSummary: round.projectSummary,
            reviewersRun: reviewers,
            candidateCount: all.length,
            rejectedCount,
            duplicatesRemoved: removed,
            suppressedCount,
            resolvedCount: resolvedFindings.length,
            findings: filtered,
            reviewerStats: reviewers.map((r) => ({
                reviewer: r,
                candidates: all.filter((f) => f.reviewer === r).length,
                status: reviewerRuns.find((run) => run.reviewer === r)?.status ?? "untracked",
                detail: reviewerRuns.find((run) => run.reviewer === r)?.detail,
            })),
            resolvedFindings,
        };
        const format = opts.format ?? "terminal";
        const rendered = format === "json"
            ? renderJson(result)
            : format === "markdown"
                ? renderMarkdown(result)
                : renderTerminal(result);
        let exportPath;
        if (opts.write !== false) {
            const dir = exportsDir(repoRoot);
            fs.mkdirSync(dir, { recursive: true });
            const ext = format === "json" ? "json" : "md";
            exportPath = path.join(dir, `report-${round.id}.${ext}`);
            const body = format === "json" ? rendered : renderMarkdown(result);
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
            }
            finally {
                global.close();
            }
        }
        mem.setRoundStatus(round.id, "reported");
        return { result, rendered, exportPath };
    }
    finally {
        mem.close();
    }
}
function matchFinding(finding, candidates) {
    const fingerprint = findingFingerprint(finding);
    return candidates.some((candidate) => findingFingerprint(candidate) === fingerprint ||
        (candidate.file === finding.file && candidate.category === finding.category &&
            titleSim(candidate.title, finding.title) >= 0.75));
}
function parseBaselineFinding(value) {
    if (!isObject(value))
        throw new Error("Baseline contains a non-object finding.");
    const required = ["title", "file", "category", "severity"];
    for (const field of required) {
        if (typeof value[field] !== "string" || !value[field].trim()) {
            throw new Error(`Baseline finding is missing ${field}.`);
        }
    }
    if (!ALL_CATEGORIES.includes(value.category)) {
        throw new Error(`Invalid baseline category: ${String(value.category)}`);
    }
    if (!SEVERITIES.includes(value.severity)) {
        throw new Error(`Invalid baseline severity: ${String(value.severity)}`);
    }
    return {
        id: typeof value.id === "string" ? value.id : randomUUID(),
        title: value.title,
        file: value.file,
        category: value.category,
        severity: value.severity,
        confidence: CONFIDENCES.includes(value.confidence)
            ? value.confidence
            : "medium",
        description: typeof value.description === "string" ? value.description : "Imported baseline finding.",
        evidence: Array.isArray(value.evidence) ? value.evidence.map(String) : [],
        evidencePackage: value.evidencePackage === undefined ? undefined
            : evidencePackageSchema.parse(value.evidencePackage),
        impact: typeof value.impact === "string" ? value.impact : "Previously reported.",
        reviewer: typeof value.reviewer === "string" ? value.reviewer : "baseline",
        status: "confirmed",
    };
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Cheap token-overlap similarity on two titles. */
function titleSim(a, b) {
    const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
    const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
    if (ta.size === 0 || tb.size === 0)
        return 0;
    let inter = 0;
    for (const t of ta)
        if (tb.has(t))
            inter++;
    return inter / Math.min(ta.size, tb.size);
}
