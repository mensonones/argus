import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

export interface DiffFile {
  /** Path relative to repo root. */
  path: string;
  /** git status letter: A(dded) M(odified) D(eleted) R(enamed) etc. */
  status: string;
  /** Unified diff hunk text for this file. */
  patch: string;
  additions: number;
  deletions: number;
}

export interface RepoDiff {
  scope: {
    mode: "integrated-branch-diff" | "single-commit";
    baseRevision: string;
    headRevision: string;
    includeWorkingTree: boolean;
    paths: string[];
    mergePolicy: "merge-resolution-changes-not-excluded" | "non-merge-commit";
  };
  /** What the diff was computed against, for display. */
  baseRef: string;
  files: DiffFile[];
  /** Raw combined unified diff. */
  raw: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const out = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return out.trim() === "true";
  } catch {
    return false;
  }
}

export async function repoRoot(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
}

/**
 * Best-effort detection of the base branch to compare against. Prefers the
 * remote HEAD (origin/main, origin/master), then common local branch names.
 */
export async function detectBaseBranch(cwd: string): Promise<string> {
  // Try the symbolic ref of origin/HEAD (e.g. "origin/main").
  try {
    const out = (
      await git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"])
    ).trim();
    const name = out.replace("refs/remotes/", "");
    if (name) return name;
  } catch {
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
    } catch {
      /* not present */
    }
  }
  // Fall back to the parent of HEAD.
  return "HEAD~1";
}

/** Return the merge-base for an integrated-tree diff, not commit attribution. */
async function mergeBase(cwd: string, base: string): Promise<string> {
  try {
    return (await git(cwd, ["merge-base", base, "HEAD"])).trim();
  } catch {
    return base;
  }
}

interface DiffOptions {
  /** Ref to compare against. If omitted, base branch is auto-detected. */
  base?: string;
  /** Review a single commit instead of a branch diff. */
  commit?: string;
  /** Limit the diff to these pathspecs. */
  paths?: string[];
  /** Include staged, unstaged, and untracked changes. Defaults to true. */
  includeWorkingTree?: boolean;
}

export async function buildDiff(
  cwd: string,
  opts: DiffOptions,
): Promise<RepoDiff> {
  let range: string[];
  let baseRef: string;
  const head = (await git(cwd, ["rev-parse", "--verify", "HEAD^{commit}"])).trim();
  let baseRevision: string;
  let headRevision = head;

  if (opts.commit) {
    baseRef = opts.commit;
    const commit = (await git(cwd, ["rev-parse", "--verify", `${opts.commit}^{commit}`])).trim();
    const parents = (await git(cwd, ["rev-list", "--parents", "-n", "1", commit])).trim().split(/\s+/).slice(1);
    if (parents.length !== 1) throw new Error("Single-commit review requires one non-merge parent; use an explicit branch/base diff for merge or root commits.");
    baseRevision = parents[0]; headRevision = commit;
    range = [baseRevision, commit];
  } else {
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
  const files: DiffFile[] = [];
  const patches = splitPatches(raw);

  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [addStr, delStr, ...rest] = line.split("\t");
    const path = rest.join("\t");
    if (!path) continue;
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
      if (files.some((f) => f.path === filePath)) continue;
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

function parseNameStatus(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0]?.charAt(0) ?? "M";
    // For renames (R100) the new path is the last column.
    const path = parts[parts.length - 1];
    if (path) map.set(path, status);
  }
  return map;
}

/** Split a combined unified diff into per-file patch text keyed by new path. */
function splitPatches(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const chunks = raw.split(/(?=^diff --git )/m);
  for (const chunk of chunks) {
    if (!chunk.startsWith("diff --git")) continue;
    // "+++ b/path" holds the post-change path; fall back to the git header.
    const plus = chunk.match(/^\+\+\+ b\/(.+)$/m);
    let path = plus?.[1]?.trim();
    if (!path || path === "/dev/null") {
      const header = chunk.match(/^diff --git a\/.+ b\/(.+)$/m);
      path = header?.[1]?.trim();
    }
    if (path) map.set(path, chunk.trimEnd() + "\n");
  }
  return map;
}
