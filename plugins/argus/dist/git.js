import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
const execFileAsync = promisify(execFile);
async function git(cwd, args) {
    const { stdout } = await execFileAsync("git", args, {
        cwd,
        maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
}
export async function isGitRepo(cwd) {
    try {
        const out = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
        return out.trim() === "true";
    }
    catch {
        return false;
    }
}
export async function repoRoot(cwd) {
    return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
}
/**
 * Best-effort detection of the base branch to compare against. Prefers the
 * remote HEAD (origin/main, origin/master), then common local branch names.
 */
export async function detectBaseBranch(cwd) {
    // Try the symbolic ref of origin/HEAD (e.g. "origin/main").
    try {
        const out = (await git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"])).trim();
        const name = out.replace("refs/remotes/", "");
        if (name)
            return name;
    }
    catch {
        /* ignore */
    }
    for (const candidate of [
        "origin/main",
        "origin/master",
        "main",
        "master",
        "develop",
    ]) {
        try {
            await git(cwd, ["rev-parse", "--verify", "--quiet", candidate]);
            return candidate;
        }
        catch {
            /* not present */
        }
    }
    // Fall back to the parent of HEAD.
    return "HEAD~1";
}
/** Return the merge-base for an integrated-tree diff, not commit attribution. */
async function mergeBase(cwd, base) {
    try {
        return (await git(cwd, ["merge-base", base, "HEAD"])).trim();
    }
    catch {
        return base;
    }
}
export async function buildDiff(cwd, opts) {
    if (opts.commit && opts.mode && opts.mode !== "auto")
        throw new Error("commit and mode are mutually exclusive.");
    if (opts.mode && !["auto", "working-tree", "branch-commits", "integrated-branch-diff"].includes(opts.mode))
        throw new Error("Unsupported review mode.");
    if (!opts.commit && opts.mode !== "integrated-branch-diff")
        return buildSelectedDiff(cwd, opts);
    let range;
    let baseRef;
    const head = (await git(cwd, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
    let baseRevision;
    let headRevision = head;
    if (opts.commit) {
        baseRef = opts.commit;
        const commit = (await git(cwd, ["rev-parse", "--verify", `${opts.commit}^{commit}`])).trim();
        const parents = (await git(cwd, ["rev-list", "--parents", "-n", "1", commit])).trim().split(/\s+/).slice(1);
        if (parents.length !== 1)
            throw new Error("Single-commit review requires one non-merge parent; use an explicit branch/base diff for merge or root commits.");
        baseRevision = parents[0];
        headRevision = commit;
        range = [baseRevision, commit];
    }
    else {
        const base = opts.base ?? (await detectBaseBranch(cwd));
        const mb = await mergeBase(cwd, base);
        baseRef = base;
        baseRevision = (await git(cwd, ["rev-parse", "--verify", `${mb}^{commit}`])).trim();
        // Integrated endpoint differences can include merge resolutions.
        range = opts.includeWorkingTree !== false ? [baseRevision] : [baseRevision, head];
    }
    const pathArgs = opts.paths && opts.paths.length ? ["--", ...opts.paths] : [];
    // numstat gives per-file add/delete counts + status.
    const numstat = await git(cwd, [
        "diff",
        "--numstat",
        "--no-color",
        "--no-renames",
        ...range,
        ...pathArgs,
    ]);
    const nameStatus = await git(cwd, [
        "diff",
        "--name-status",
        "--no-color",
        "--no-renames",
        ...range,
        ...pathArgs,
    ]);
    const raw = await git(cwd, [
        "diff",
        "--no-color",
        "--no-renames",
        "--unified=3",
        ...range,
        ...pathArgs,
    ]);
    const statusByPath = parseNameStatus(nameStatus);
    const files = [];
    const patches = splitPatches(raw);
    for (const line of numstat.split("\n")) {
        if (!line.trim())
            continue;
        const [addStr, delStr, ...rest] = line.split("\t");
        const path = rest.join("\t");
        if (!path)
            continue;
        files.push({
            path,
            status: statusByPath.get(path) ?? "M",
            additions: addStr === "-" ? 0 : Number(addStr),
            deletions: delStr === "-" ? 0 : Number(delStr),
            patch: patches.get(path) ?? "",
        });
    }
    // `git diff` never includes untracked files. Add them explicitly for the
    // default interactive review so "current change" means the whole worktree.
    if (!opts.commit && opts.includeWorkingTree !== false) {
        const untracked = await git(cwd, [
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            ...pathArgs,
        ]);
        for (const filePath of untracked.split("\0").filter(Boolean)) {
            if (files.some((f) => f.path === filePath))
                continue;
            const body = await fs.readFile(path.join(cwd, filePath));
            const binary = body.includes(0);
            const source = binary ? "" : body.toString("utf8");
            const lineCount = binary || source.length === 0
                ? 0
                : source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
            const patch = binary
                ? `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\nBinary files /dev/null and b/${filePath} differ\n`
                : source.length === 0
                    ? `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n`
                    : [
                        `diff --git a/${filePath} b/${filePath}`,
                        "new file mode 100644",
                        "--- /dev/null",
                        `+++ b/${filePath}`,
                        `@@ -0,0 +1,${lineCount} @@`,
                        ...source.replace(/\n$/, "").split("\n").map((line) => `+${line}`),
                        "",
                    ].join("\n");
            files.push({
                path: filePath,
                status: "A",
                additions: lineCount,
                deletions: 0,
                patch,
            });
        }
    }
    const extraRaw = files
        .filter((f) => !patches.has(f.path))
        .map((f) => f.patch)
        .join("");
    return { baseRef, files, raw: raw + extraRaw, scope: {
            mode: opts.commit ? "single-commit" : "integrated-branch-diff",
            baseRevision, headRevision,
            includeWorkingTree: !opts.commit && opts.includeWorkingTree !== false,
            paths: opts.paths ?? [],
            mergePolicy: opts.commit ? "non-merge-commit" : "merge-resolution-changes-not-excluded",
        } };
}
async function buildSelectedDiff(cwd, opts) {
    const head = (await git(cwd, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
    const paths = opts.paths?.length ? ["--", ...opts.paths] : [];
    const localNames = new Set();
    for (const args of [["diff", "--name-only", "-z", "--cached", head], ["diff", "--name-only", "-z"], ["ls-files", "--others", "--exclude-standard", "-z"]]) {
        for (const file of (await git(cwd, [...args, ...paths])).split("\0").filter(Boolean))
            localNames.add(file);
    }
    const eligible = (file) => file !== ".argus" && !file.startsWith(".argus/") && (opts.isReviewablePath?.(file) ?? true);
    const hasLocal = [...localNames].some(eligible);
    const mode = opts.mode && opts.mode !== "auto" ? opts.mode
        : opts.includeWorkingTree === false ? "branch-commits" : hasLocal ? "working-tree" : "branch-commits";
    if (mode === "working-tree" && opts.includeWorkingTree === false)
        throw new Error("working-tree conflicts with includeWorkingTree=false.");
    const patchSets = [];
    let baseRef = "HEAD", baseRevision = head, baseTipRevision;
    const selectedCommits = [];
    if (mode === "branch-commits") {
        baseRef = opts.base ?? await detectBaseBranch(cwd);
        baseTipRevision = (await git(cwd, ["rev-parse", "--verify", `${baseRef}^{commit}`])).trim();
        baseRevision = (await git(cwd, ["merge-base", baseTipRevision, head])).trim();
        const commits = (await git(cwd, ["rev-list", "--reverse", "--topo-order", "--no-merges", `${baseTipRevision}..${head}`])).trim().split("\n").filter(Boolean);
        for (const revision of commits) {
            const diff = await buildDiff(cwd, { commit: revision, paths: opts.paths });
            if (!diff.files.length)
                continue; // path-restricted selection records only evaluated patches
            selectedCommits.push(revision);
            patchSets.push({ kind: "commit", revision, parentRevision: diff.scope.baseRevision, files: diff.files, raw: diff.raw });
        }
    }
    else {
        const staged = await readTrackedDiff(cwd, ["--cached", head], paths);
        const unstaged = await readTrackedDiff(cwd, [], paths);
        patchSets.push({ kind: "staged", revision: head, files: staged.files, raw: staged.raw }, { kind: "unstaged", revision: head, files: unstaged.files, raw: unstaged.raw });
        // Reuse the explicit integrated reader only for its untracked-file handling.
        const local = await buildDiff(cwd, { mode: "integrated-branch-diff", base: head, paths: opts.paths, includeWorkingTree: true });
        const tracked = new Set((await git(cwd, ["ls-files", "-z", ...paths])).split("\0"));
        const files = local.files.filter(f => !tracked.has(f.path) && f.path !== ".argus" && !f.path.startsWith(".argus/"));
        patchSets.push({ kind: "untracked", revision: head, files, raw: files.map(f => f.patch).join("") });
    }
    const sets = patchSets.map(set => ({ ...set, files: set.files.filter(f => f.path !== ".argus" && !f.path.startsWith(".argus/")) }))
        .filter(set => set.files.length).map(set => ({ ...set, raw: set.files.map(f => f.patch).join("") }));
    const byPath = new Map();
    for (const set of sets)
        for (const file of set.files) {
            const previous = byPath.get(file.path);
            byPath.set(file.path, previous ? { ...file, additions: previous.additions + file.additions,
                deletions: previous.deletions + file.deletions, patch: previous.patch + file.patch } : { ...file });
        }
    return { baseRef, files: [...byPath.values()], patchSets: sets,
        raw: sets.map(set => `# Argus patch boundary: ${set.kind} ${set.parentRevision ?? ""} -> ${set.revision}\n${set.raw}`).join("\n"),
        scope: { mode, baseRevision, headRevision: head, baseTipRevision, paths: opts.paths ?? [],
            includeWorkingTree: mode === "working-tree", selectedCommits,
            mergePolicy: mode === "branch-commits" ? "merges-excluded" : "not-applicable",
            selectionReason: opts.mode && opts.mode !== "auto" ? "explicit-mode" : opts.includeWorkingTree === false ? "committed-only" : hasLocal ? "reviewable-local-changes" : "no-reviewable-local-changes" } };
}
async function readTrackedDiff(cwd, range, paths) {
    const raw = await git(cwd, ["diff", "--no-color", "--no-renames", "--unified=3", ...range, ...paths]);
    const statuses = parseNameStatus(await git(cwd, ["diff", "--name-status", "--no-renames", ...range, ...paths]));
    const patches = splitPatches(raw);
    const numstat = await git(cwd, ["diff", "--numstat", "--no-renames", ...range, ...paths]);
    return { raw, files: numstat.split("\n").filter(Boolean).map(line => {
            const [adds, dels, ...parts] = line.split("\t"), file = parts.join("\t");
            return { path: file, status: statuses.get(file) ?? "M", additions: adds === "-" ? 0 : Number(adds),
                deletions: dels === "-" ? 0 : Number(dels), patch: patches.get(file) ?? "" };
        }) };
}
function parseNameStatus(text) {
    const map = new Map();
    for (const line of text.split("\n")) {
        if (!line.trim())
            continue;
        const parts = line.split("\t");
        const status = parts[0]?.charAt(0) ?? "M";
        // For renames (R100) the new path is the last column.
        const path = parts[parts.length - 1];
        if (path)
            map.set(path, status);
    }
    return map;
}
/** Split a combined unified diff into per-file patch text keyed by new path. */
function splitPatches(raw) {
    const map = new Map();
    const chunks = raw.split(/(?=^diff --git )/m);
    for (const chunk of chunks) {
        if (!chunk.startsWith("diff --git"))
            continue;
        // "+++ b/path" holds the post-change path; fall back to the git header.
        const plus = chunk.match(/^\+\+\+ b\/(.+)$/m);
        let path = plus?.[1]?.trim();
        if (!path || path === "/dev/null") {
            const header = chunk.match(/^diff --git a\/.+ b\/(.+)$/m);
            path = header?.[1]?.trim();
        }
        if (path)
            map.set(path, chunk.trimEnd() + "\n");
    }
    return map;
}
