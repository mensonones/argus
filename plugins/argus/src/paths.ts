import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

/** Directory Argus stores per-target state in (like Proteus's `.vros/`). */
export const ARGUS_DIR = ".argus";

/** Resolve the git repo root for a directory, or fall back to the dir itself. */
export function repoRootSync(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return path.resolve(cwd);
  }
}

export function targetDir(repoRoot: string): string {
  return path.join(repoRoot, ARGUS_DIR);
}

export function targetDbPath(repoRoot: string): string {
  return path.join(targetDir(repoRoot), "memory.sqlite");
}

export function exportsDir(repoRoot: string): string {
  return path.join(targetDir(repoRoot), "exports");
}

/** Global cross-target memory, mirroring Proteus's `~/.vros/global.sqlite`. */
export function globalDir(): string {
  return path.join(os.homedir(), ARGUS_DIR);
}

export function globalDbPath(): string {
  return path.join(globalDir(), "global.sqlite");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
