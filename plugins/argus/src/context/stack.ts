import fs from "node:fs/promises";
import path from "node:path";

export interface StackSignal {
  kind: "framework" | "test-runner" | "package-manager";
  name: string;
  manifest: string;
  evidence: string;
}

export interface StackDetection {
  signals: StackSignal[];
  manifests: string[];
  warnings: string[];
  truncated: boolean;
}

const FRAMEWORKS: Record<string, string> = {
  react: "React", "react-native": "React Native", next: "Next.js",
  express: "Express", "@nestjs/core": "NestJS", fastify: "Fastify",
  vue: "Vue", "@angular/core": "Angular", svelte: "Svelte",
};
const RUNNERS: Record<string, string> = {
  jest: "Jest", vitest: "Vitest", mocha: "Mocha",
  "@playwright/test": "Playwright", cypress: "Cypress",
};
const BLOCKED = new Set(["node_modules", "vendor", ".git", ".argus"]);
const MAX_DIRECTORIES = 64;

/** Declaration-based hints, not proof of usage. Never execute package scripts. */
export async function detectStack(repoRoot: string, changedPaths: string[]): Promise<StackDetection> {
  const root = await fs.realpath(repoRoot);
  const directories = new Set<string>([""]);
  let truncated = false;
  for (const file of [...changedPaths].sort()) {
    const normalized = file.replaceAll("\\", "/");
    const parts = normalized.split("/");
    if (path.isAbsolute(normalized) || parts.some(p => p === ".." || BLOCKED.has(p))) continue;
    let dir = path.posix.dirname(normalized);
    while (dir !== ".") {
      if (directories.size >= MAX_DIRECTORIES && !directories.has(dir)) { truncated = true; break; }
      directories.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  const result: StackDetection = { signals: [], manifests: [], warnings: [], truncated };
  for (const dir of [...directories].sort()) {
    const manifest = path.posix.join(dir, "package.json");
    let handle;
    try {
      const real = await fs.realpath(path.join(root, manifest));
      const relative = path.relative(root, real);
      if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
        result.warnings.push(`${manifest}: target outside repository skipped`); continue;
      }
      handle = await fs.open(real, "r");
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 1024 * 1024) {
        result.warnings.push(`${manifest}: not a regular manifest or exceeds 1 MiB`); continue;
      }
      const pkg: unknown = JSON.parse(await handle.readFile("utf8"));
      if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) throw new Error("object expected");
      result.manifests.push(manifest);
      const data = pkg as Record<string, unknown>;
      for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        const deps = data[section];
        if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
        for (const [dep, value] of Object.entries(deps)) {
          if (typeof value !== "string" || !value.trim()) continue;
          const kind = FRAMEWORKS[dep] ? "framework" : RUNNERS[dep] ? "test-runner" : null;
          if (kind) result.signals.push({ kind, name: FRAMEWORKS[dep] ?? RUNNERS[dep], manifest, evidence: `${section}.${dep}` });
        }
      }
      if (typeof data.packageManager === "string") {
        const manager = /^(npm|pnpm|yarn|bun)@[^\s]+$/.exec(data.packageManager)?.[1];
        if (manager) result.signals.push({ kind: "package-manager", name: manager, manifest, evidence: "packageManager" });
      }
      const scripts = data.scripts;
      if (scripts && typeof scripts === "object" && !Array.isArray(scripts)) {
        for (const [key, script] of Object.entries(scripts)) {
          if (typeof script === "string" && /(?:^|[\s;&|])node\s+--test(?:\s|$)/.test(script)) {
            result.signals.push({ kind: "test-runner", name: "Node.js test runner", manifest, evidence: `scripts.${key} declares node --test` });
          }
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") result.warnings.push(`${manifest}: unreadable or invalid JSON`);
    } finally { await handle?.close(); }
  }
  result.signals.sort((a, b) => `${a.manifest}:${a.kind}:${a.name}:${a.evidence}`.localeCompare(`${b.manifest}:${b.kind}:${b.name}:${b.evidence}`));
  return result;
}
