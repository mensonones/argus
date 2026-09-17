#!/usr/bin/env node
/**
 * Verify an Argus installation in the DeepSeek Harness (DSH).
 *
 * Checks the generated bundle, the skills written to the user skill root, the
 * Argus MCP row in the user patch layer, the specialist tool names, and a real
 * MCP handshake — then prints a JSON report and exits nonzero on any failure.
 *
 * Usage:
 *   node scripts/doctor-dsh.mjs [--profile web] [--dsh-home <dir>] [--dsh-bin <path>]
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
const BUNDLE_NAME = "@argus/dsh-plugin";
const EXPECTED_TOOLS = [
  "argus_correctness",
  "argus_security",
  "argus_performance",
  "argus_architecture",
  "argus_tests",
  "argus_challenger",
];

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
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

function readYaml(file) {
  if (!fs.existsSync(file)) return undefined;
  return YAML.parse(fs.readFileSync(file, "utf8"));
}

/** Every `mcp__argus__<tool>` name referenced by a generated artifact. */
function referencedTools(text) {
  const names = new Set();
  for (const match of text.matchAll(/mcp__argus__([a-z0-9_]+)/g)) names.add(match[1]);
  return names;
}

function handshake() {
  if (!fs.existsSync(mcpScript)) {
    return { ok: false, detail: `Missing ${mcpScript}; build Argus first`, tools: [] };
  }
  const input =
    [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "argus-dsh-doctor", version: "1" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ]
      .map((message) => JSON.stringify(message))
      .join("\n") + "\n";
  const child = spawnSync(process.execPath, [mcpScript], {
    input,
    encoding: "utf8",
    timeout: 8_000,
  });
  if (child.error) return { ok: false, detail: child.error.message, tools: [] };
  if (child.status !== 0) {
    return {
      ok: false,
      detail: child.stderr.trim() || `MCP exited with ${child.status}`,
      tools: [],
    };
  }
  try {
    const responses = child.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const tools = responses.find((message) => message.id === 2)?.result?.tools;
    const names = Array.isArray(tools) ? tools.map((tool) => tool.name) : [];
    const required = ["argus_init", "argus_record_finding", "argus_record_challenge", "argus_baseline_findings", "argus_reconcile", "argus_report"];
    const missing = required.filter((name) => !names.includes(name));
    return missing.length === 0
      ? { ok: true, detail: `${names.length} MCP tools available`, tools: names }
      : { ok: false, detail: `Missing MCP tools: ${missing.join(", ")}`, tools: names };
  } catch (error) {
    return { ok: false, detail: `Invalid MCP response: ${error.message}`, tools: [] };
  }
}

function doctor() {
  const profile = argumentValue("--profile") ?? "web";
  const dshHome = resolveDshHome();
  const checks = [];

  // 1. The generated bundle.
  const manifestFile = path.join(bundleDir, "package.json");
  let patchFile;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    patchFile = path.resolve(bundleDir, manifest.dsh?.bundle?.patch ?? "");
    checks.push({
      name: "bundle:manifest",
      ok: manifest.name === BUNDLE_NAME && manifest.dsh?.bundle?.patch !== undefined,
      detail: `${manifestFile} (${manifest.name ?? "unnamed"})`,
    });
  } catch (error) {
    checks.push({ name: "bundle:manifest", ok: false, detail: `${manifestFile}: ${error.message}` });
  }

  let patch;
  if (patchFile !== undefined) {
    try {
      patch = readYaml(patchFile);
      const rows = (Array.isArray(patch) ? patch : [])
        .flatMap((entry) => (Array.isArray(entry?.insert) ? entry.insert : []))
        .filter((row) => row?.name === "@deepseek-ai/dsh-tool-subagent");
      const names = rows.map((row) => row.config?.toolName);
      const missing = EXPECTED_TOOLS.filter((name) => !names.includes(name));
      const withoutPersona = rows.filter((row) => !row.config?.persona);
      checks.push({
        name: "bundle:patch",
        ok: rows.length === EXPECTED_TOOLS.length && missing.length === 0 && withoutPersona.length === 0,
        detail:
          missing.length > 0
            ? `missing reviewer tools: ${missing.join(", ")}`
            : withoutPersona.length > 0
              ? `${withoutPersona.length} reviewer tool(s) without a persona`
              : `${rows.length} reviewer tools in ${patchFile}`,
      });
    } catch (error) {
      checks.push({ name: "bundle:patch", ok: false, detail: `${patchFile}: ${error.message}` });
    }
  }

  // 2. Skills written to the user skill root.
  const skillsRoot = path.join(dshHome, "skills");
  const skillNames = fs.existsSync(path.join(bundleDir, "skills"))
    ? fs
        .readdirSync(path.join(bundleDir, "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  for (const name of skillNames) {
    const file = path.join(skillsRoot, name, "SKILL.md");
    let detail = file;
    let ok = fs.existsSync(file);
    if (ok) {
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(file, "utf8"));
      const fields = frontmatter ? YAML.parse(frontmatter[1]) : {};
      ok = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(fields.name)) && Boolean(fields.description);
      detail = ok
        ? `${file} (name: ${fields.name})`
        : `${file} needs a kebab-case "name" and a "description"`;
    }
    checks.push({ name: `skill:${name}`, ok, detail });
  }

  // 3. The MCP row in the user patch layer.
  const userPatchFile = path.join(dshHome, "cordis.patch.yml");
  let mcpConfig;
  try {
    const userPatch = readYaml(userPatchFile);
    const row = (Array.isArray(userPatch) ? userPatch : [])
      .flatMap((entry) => (Array.isArray(entry?.insert) ? entry.insert : []))
      .find((item) => item?.id === MCP_ROW_ID);
    mcpConfig = row?.config;
    const args = mcpConfig?.args;
    const target = Array.isArray(args) ? args.find((item) => String(item).endsWith("argus-mcp.js")) : undefined;
    checks.push({
      name: "config:mcp",
      ok:
        mcpConfig?.serverName === "argus" &&
        mcpConfig?.transport === "stdio" &&
        path.isAbsolute(String(mcpConfig?.command ?? "")) &&
        fs.existsSync(String(mcpConfig?.command)) &&
        Boolean(target) &&
        fs.existsSync(String(target)),
      detail: mcpConfig === undefined ? `no "${MCP_ROW_ID}" row in ${userPatchFile}` : userPatchFile,
    });
  } catch (error) {
    checks.push({ name: "config:mcp", ok: false, detail: `${userPatchFile}: ${error.message}` });
  }

  // A renamed Argus skill must not linger as a stale slash entry in the menu.
  const canonicalRoot = path.join(pluginDir, "skills");
  const canonicalNames = fs.existsSync(canonicalRoot)
    ? fs
        .readdirSync(canonicalRoot, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() && fs.existsSync(path.join(canonicalRoot, entry.name, "SKILL.md")),
        )
        .map((entry) => entry.name)
    : [];
  const staleSkills = canonicalNames.filter(
    (name) => !skillNames.includes(name) && fs.existsSync(path.join(skillsRoot, name)),
  );
  checks.push({
    name: "skills:no-stale",
    ok: staleSkills.length === 0,
    detail:
      staleSkills.length > 0
        ? `stale Argus skills in ${skillsRoot}: ${staleSkills.join(", ")}`
        : "no stale Argus skill directories",
  });

  // 4. The bundle is composed by the profile.
  const manifestFileForProfile = path.join(dshHome, "profiles", profile, "package.json");
  try {
    const profileManifest = JSON.parse(fs.readFileSync(manifestFileForProfile, "utf8"));
    const bundles = profileManifest.dsh?.profile?.bundles ?? [];
    checks.push({
      name: "bundle:registered",
      ok: bundles.includes(BUNDLE_NAME),
      detail: bundles.includes(BUNDLE_NAME)
        ? `${BUNDLE_NAME} in profile "${profile}"`
        : `run: dsh plugin --profile ${profile} add ${bundleDir}`,
    });
  } catch (error) {
    checks.push({
      name: "bundle:registered",
      ok: false,
      detail: `${manifestFileForProfile}: ${error.message}`,
    });
  }

  // 5. A real MCP handshake, plus the drift check between artifacts and server.
  const mcp = handshake();
  checks.push({ name: "mcp:handshake", ok: mcp.ok, detail: mcp.detail });
  const referenced = new Set();
  for (const name of skillNames) {
    const file = path.join(bundleDir, "skills", name, "SKILL.md");
    if (fs.existsSync(file)) {
      for (const tool of referencedTools(fs.readFileSync(file, "utf8"))) referenced.add(tool);
    }
  }
  if (patchFile !== undefined && fs.existsSync(patchFile)) {
    for (const tool of referencedTools(fs.readFileSync(patchFile, "utf8"))) referenced.add(tool);
  }
  const unknown = [...referenced].filter((name) => !mcp.tools.includes(name));
  checks.push({
    name: "names:no-drift",
    ok: mcp.ok && unknown.length === 0,
    detail:
      unknown.length > 0
        ? `generated artifacts reference unknown MCP tools: ${unknown.join(", ")}`
        : `${referenced.size} referenced MCP tools all exist`,
  });

  const dshBin = resolveDshBin();
  const result = {
    ok: checks.every((check) => check.ok),
    dshHome,
    profile,
    dshBin: dshBin ?? null,
    checks,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

try {
  doctor();
} catch (error) {
  console.error(`Argus DSH doctor failed: ${error.message}`);
  process.exitCode = 1;
}
