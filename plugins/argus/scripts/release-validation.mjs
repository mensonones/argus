#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "argus-release-"));

try {
  const packed = JSON.parse(execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", tempRoot],
    { cwd: pluginDir, encoding: "utf8" },
  ));
  const packageInfo = packed[0];
  const names = new Set(packageInfo.files.map((file) => file.path));
  for (const required of [
    "package.json",
    "plugin.json",
    "mcp.json",
    ".mcp.json",
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    "scripts/argus-mcp.cjs",
    "dist/bin/argus-mcp.js",
    "dist/sqlite.js",
    "dist/version.js",
    "dist/personas.json",
    "skills/full-review/SKILL.md",
    "skills/react-review/SKILL.md",
    "skills/node-test-review/SKILL.md",
  ]) {
    if (!names.has(required)) throw new Error(`Package is missing ${required}`);
  }

  fs.writeFileSync(
    path.join(tempRoot, "package.json"),
    '{"name":"argus-release-validation","private":true}\n',
  );
  const archive = path.join(tempRoot, packageInfo.filename);
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive], {
    cwd: tempRoot,
    stdio: "pipe",
  });
  const installed = path.join(tempRoot, "node_modules", "@argus", "runtime");
  const runtimePackage = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8"));
  const portablePlugin = JSON.parse(fs.readFileSync(path.join(installed, "plugin.json"), "utf8"));
  if (portablePlugin.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" ||
      portablePlugin.version !== runtimePackage.version || !portablePlugin.extensions?.["com.openai"]?.interface) {
    throw new Error("Packaged portable plugin manifest is invalid or out of sync.");
  }
  const portableMcp = JSON.parse(fs.readFileSync(path.join(installed, "mcp.json"), "utf8"));
  if (portableMcp.$schema !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json" ||
      portableMcp.mcpServers?.argus?.type !== "stdio") {
    throw new Error("Packaged portable MCP manifest is invalid.");
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(installed, ".mcp.json"), "utf8"));
  const definition = manifest.mcpServers?.argus;
  if (!definition || !Array.isArray(definition.args)) {
    throw new Error("Packaged MCP manifest is invalid.");
  }

  const input = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2024-11-05", capabilities: {},
      clientInfo: { name: "argus-release-validation", version: "1" },
    } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ].map((message) => JSON.stringify(message)).join("\n") + "\n";
  const child = spawnSync(
    definition.command === "node" ? process.execPath : definition.command,
    definition.args,
    {
      cwd: installed,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: installed },
      input,
      encoding: "utf8",
      timeout: 8_000,
    },
  );
  if (child.status !== 0) throw new Error(child.stderr || `MCP exited with ${child.status}`);
  const responses = child.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const tools = responses.find((message) => message.id === 2)?.result?.tools ?? [];
  const namesFromMcp = new Set(tools.map((tool) => tool.name));
  for (const required of [
    "argus_init", "argus_record_finding", "argus_record_challenge",
    "argus_import_baseline", "argus_suppress_finding", "argus_reconcile", "argus_baseline_findings", "argus_report",
  ]) {
    if (!namesFromMcp.has(required)) throw new Error(`Packaged MCP is missing ${required}`);
  }
  const portableDefinition = portableMcp.mcpServers.argus;
  const portableChild = spawnSync(
    portableDefinition.command === "node" ? process.execPath : portableDefinition.command,
    portableDefinition.args,
    {
      cwd: installed,
      env: { ...process.env, PLUGIN_ROOT: installed },
      input,
      encoding: "utf8",
      timeout: 8_000,
    },
  );
  if (portableChild.status !== 0) {
    throw new Error(portableChild.stderr || `Portable MCP exited with ${portableChild.status}`);
  }
  const portableResponses = portableChild.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const portableTools = portableResponses.find((message) => message.id === 2)?.result?.tools ?? [];
  if (portableTools.length !== tools.length) {
    throw new Error("Portable and compatibility MCP manifests expose different tool counts.");
  }
  console.log(`Release validation passed: ${packageInfo.filename}, ${tools.length} MCP tools.`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
