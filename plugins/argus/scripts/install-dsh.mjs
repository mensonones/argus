#!/usr/bin/env node
/**
 * Install Argus into the DeepSeek Harness (DSH).
 *
 * DSH composes a profile from ordered patch layers, then your own
 * `$DSH_HOME/cordis.patch.yml`. Two things therefore have to happen:
 *
 *   1. The Argus skills are written to the user skill root (`$DSH_HOME/skills`),
 *      which the `dsh-skill-filesystem` provider scans on every surface — the
 *      Web GUI's `standard` preset included.
 *   2. The Argus MCP server is registered in the user patch layer, because a
 *      profile patch cannot resolve a path relative to its own package, so the
 *      absolute launcher path has to be written here.
 *
 * The specialist reviewer tools live in the DSH profile bundle
 * (`plugins/argus-dsh`), registered with `dsh plugin --profile <name> add`.
 *
 * Usage:
 *   node scripts/install-dsh.mjs [--profile web] [--dsh-home <dir>]
 *                                [--dsh-bin <path>] [--dry-run] [--skip-bundle]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, "..");
const repoRoot = path.resolve(pluginDir, "..", "..");
const bundleDir = path.join(repoRoot, "plugins", "argus-dsh");
const mcpScript = path.join(pluginDir, "dist", "bin", "argus-mcp.js");

const MCP_ROW_ID = "mcp-argus";
const SERVER_NAME = "argus";
const BUNDLE_NAME = "@argus/dsh-plugin";
const SKILL_STATE_FILE = ".argus-skills.json";
const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function resolveDshHome() {
  const explicit = argumentValue("--dsh-home");
  if (explicit) return path.resolve(explicit);
  const fromEnv = process.env.DSH_HOME?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(os.homedir(), ".dsh");
}

function resolveDshBin() {
  const explicit = argumentValue("--dsh-bin") ?? process.env.DSH_BIN?.trim();
  if (explicit) return explicit;
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["dsh"], {
    encoding: "utf8",
  });
  if (probe.status !== 0) return undefined;
  return probe.stdout.split("\n").map((line) => line.trim()).find(Boolean);
}

/** Drop every previously installed Argus MCP row, so re-running is idempotent. */
function withoutMcpRow(entries) {
  const next = [];
  for (const entry of entries) {
    if (entry && typeof entry === "object" && Array.isArray(entry.insert)) {
      const insert = entry.insert.filter((row) => !(row && row.id === MCP_ROW_ID));
      if (insert.length === 0) continue;
      next.push({ ...entry, insert });
      continue;
    }
    next.push(entry);
  }
  return next;
}

function mcpEntry() {
  return {
    insert: [
      {
        id: MCP_ROW_ID,
        name: "@deepseek-ai/dsh-mcp-client",
        config: {
          serverName: SERVER_NAME,
          transport: "stdio",
          command: process.execPath,
          args: [mcpScript],
        },
      },
    ],
  };
}

function readUserPatch(patchFile) {
  if (!fs.existsSync(patchFile)) return { entries: [], existed: false, original: "" };
  const original = fs.readFileSync(patchFile, "utf8");
  if (original.trim() === "") return { entries: [], existed: true, original };
  let parsed;
  try {
    parsed = YAML.parse(original);
  } catch (error) {
    throw new Error(`Cannot parse ${patchFile}: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `${patchFile} must be a top-level YAML array of patch entries; refusing to rewrite it.`,
    );
  }
  return { entries: parsed, existed: true, original };
}

/** Direct children of a skills root that hold a `SKILL.md`. */
function skillNamesIn(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

/** The Argus skill directories this installer owns, under any host name. */
function managedSkillNames(dshHome) {
  return [...new Set([...readSkillState(dshHome), ...skillNamesIn(path.join(pluginDir, "skills"))])];
}

/** Names this installer wrote on a previous run, so pruning stays precise. */
function readSkillState(dshHome) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dshHome, SKILL_STATE_FILE), "utf8"));
    return Array.isArray(parsed.skills)
      ? parsed.skills.filter((name) => typeof name === "string")
      : [];
  } catch {
    return [];
  }
}

function installSkills(dshHome, dryRun) {
  const source = path.join(bundleDir, "skills");
  if (!fs.existsSync(source)) {
    throw new Error(`Missing ${source}. Run the generator first: npm run gen-hosts`);
  }
  const destination = path.join(dshHome, "skills");
  const names = skillNamesIn(source);

  // A renamed or dropped Argus skill must not linger as a stale slash entry, so
  // every Argus-owned directory outside the current set goes. Only names Argus
  // itself installed (or canonical names) are candidates, never a foreign skill.
  const stale = managedSkillNames(dshHome).filter(
    (name) => !names.includes(name) && SKILL_NAME.test(name),
  );
  for (const name of stale) {
    const target = path.join(destination, name);
    if (!fs.existsSync(target)) continue;
    if (dryRun) {
      console.log(`Would remove stale skill: ${name}`);
      continue;
    }
    fs.rmSync(target, { recursive: true, force: true });
    console.log(`Removed stale skill: ${name}`);
  }

  if (!dryRun) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of names) {
      fs.cpSync(path.join(source, name), path.join(destination, name), {
        recursive: true,
        force: true,
      });
    }
    fs.writeFileSync(
      path.join(dshHome, SKILL_STATE_FILE),
      JSON.stringify({ skills: names }, null, 2) + "\n",
      "utf8",
    );
  }
  console.log(
    `${dryRun ? "Would install" : "Installed"} ${names.length} skills in ${destination}`,
  );
  console.log(`  ${names.join(", ")}`);
  return names.length;
}

function installMcpRow(dshHome, dryRun) {
  const patchFile = path.join(dshHome, "cordis.patch.yml");
  const { entries, existed, original } = readUserPatch(patchFile);
  const next = [...withoutMcpRow(entries), mcpEntry()];
  const rendered = YAML.stringify(next, { lineWidth: 0 });
  const changed = !existed || rendered !== original;
  if (dryRun) {
    console.log(`${changed ? "Would update" : "Already current"}: ${patchFile}`);
    return;
  }
  if (!changed) {
    console.log(`Already current: ${patchFile}`);
    return;
  }
  fs.mkdirSync(dshHome, { recursive: true });
  if (existed && original.trim() !== "") {
    const backup = `${patchFile}.argus-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(patchFile, backup);
    console.log(`Backed up existing patch: ${backup}`);
  }
  fs.writeFileSync(patchFile, rendered, "utf8");
  console.log(`Registered the Argus MCP server (${SERVER_NAME}) in ${patchFile}`);
}

function registerBundle(profile, dryRun) {
  const bin = resolveDshBin();
  if (bin === undefined) {
    console.warn(
      "dsh was not found on PATH, so the specialist reviewer tools were not registered.\n" +
        `Run this yourself after installing DSH:\n  dsh plugin --profile ${profile} add ${bundleDir}`,
    );
    return;
  }
  const args = ["plugin", "--profile", profile, "add", bundleDir];
  if (dryRun) {
    console.log(`Would register the bundle: ${bin} ${args.join(" ")}`);
    return;
  }
  const result = spawnSync(bin, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.warn(
      `dsh plugin exited with code ${result.status}. The bundle is not registered; ` +
        `register it manually with:\n  dsh plugin --profile ${profile} add ${bundleDir}`,
    );
    return;
  }
  console.log(`Registered the DSH bundle ${BUNDLE_NAME} in profile "${profile}"`);
}

function install() {
  const dryRun = hasFlag("--dry-run");
  const profile = argumentValue("--profile") ?? "web";
  const dshHome = resolveDshHome();

  if (!fs.existsSync(mcpScript)) {
    throw new Error(`Missing ${mcpScript}. Build Argus first: npm run build`);
  }
  if (!fs.existsSync(path.join(bundleDir, "cordis.patch.yml"))) {
    throw new Error(`Missing ${bundleDir}/cordis.patch.yml. Run: npm run gen-hosts`);
  }

  console.log(`DSH home: ${dshHome}`);
  console.log(`Profile:  ${profile}${dryRun ? " (dry run)" : ""}`);

  installSkills(dshHome, dryRun);
  installMcpRow(dshHome, dryRun);
  if (hasFlag("--skip-bundle")) {
    console.log("Skipped the DSH bundle (--skip-bundle): no specialist reviewer tools.");
  } else {
    registerBundle(profile, dryRun);
  }

  console.log("");
  console.log("Next steps:");
  console.log("  1. Restart the DSH surface (or reload its profile) so the patch applies.");
  console.log("  2. In a Git repository, run /argus-review — or ask for an Argus review.");
  console.log("  3. Add .argus/ to that repository's .gitignore (Argus memory lives there).");
}

try {
  install();
} catch (error) {
  console.error(`Argus DSH installation failed: ${error.message}`);
  process.exitCode = 1;
}
