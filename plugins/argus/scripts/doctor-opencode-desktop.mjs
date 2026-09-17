#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { parse, printParseErrorCode } from "jsonc-parser";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function configDirectory() {
  const explicit = argumentValue("--config-dir");
  if (explicit) return path.resolve(explicit);
  return process.env.XDG_CONFIG_HOME
    ? path.join(path.resolve(process.env.XDG_CONFIG_HOME), "opencode")
    : path.join(os.homedir(), ".config", "opencode");
}

function configFile(configDir) {
  const json = path.join(configDir, "opencode.json");
  const jsonc = path.join(configDir, "opencode.jsonc");
  if (fs.existsSync(json) && fs.existsSync(jsonc)) {
    throw new Error(`Both ${json} and ${jsonc} exist; the active global config is ambiguous.`);
  }
  if (fs.existsSync(jsonc)) return jsonc;
  if (fs.existsSync(json)) return json;
  throw new Error(`No global OpenCode config found in ${configDir}.`);
}

function checkFile(checks, label, filename) {
  const ok = fs.existsSync(filename) && fs.statSync(filename).isFile();
  checks.push({ name: label, ok, detail: filename });
}

function handshake(command) {
  if (!Array.isArray(command) || command.length < 2 ||
      command.some((item) => typeof item !== "string")) {
    return { ok: false, detail: "mcp.argus.command must be an executable/argument array" };
  }
  if (!path.isAbsolute(command[0]) || !fs.existsSync(command[0])) {
    return { ok: false, detail: `MCP executable does not exist: ${command[0]}` };
  }
  const serverPath = command.find((item, index) => index > 0 && item.endsWith("argus-mcp.js"));
  if (!serverPath || !path.isAbsolute(serverPath) || !fs.existsSync(serverPath)) {
    return { ok: false, detail: "Argus MCP script is missing or is not configured with an absolute path" };
  }
  const input = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "argus-opencode-doctor", version: "1" },
    } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ].map((message) => JSON.stringify(message)).join("\n") + "\n";
  const child = spawnSync(command[0], command.slice(1), {
    input,
    encoding: "utf8",
    timeout: 8_000,
  });
  if (child.error) return { ok: false, detail: child.error.message };
  if (child.status !== 0) {
    return { ok: false, detail: child.stderr.trim() || `MCP exited with ${child.status}` };
  }
  try {
    const responses = child.stdout.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const tools = responses.find((message) => message.id === 2)?.result?.tools;
    const names = Array.isArray(tools) ? tools.map((tool) => tool.name) : [];
    const required = ["argus_init", "argus_record_finding", "argus_record_challenge", "argus_baseline_findings", "argus_reconcile", "argus_report"];
    const missing = required.filter((name) => !names.includes(name));
    return missing.length === 0
      ? { ok: true, detail: `${names.length} MCP tools available` }
      : { ok: false, detail: `Missing MCP tools: ${missing.join(", ")}` };
  } catch (error) {
    return { ok: false, detail: `Invalid MCP response: ${error.message}` };
  }
}

function doctor() {
  const root = configDirectory();
  const file = configFile(root);
  const errors = [];
  const config = parse(fs.readFileSync(file, "utf8"), errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(errors.map((item) =>
      `${printParseErrorCode(item.error)} at offset ${item.offset}`).join(", "));
  }

  const checks = [];
  checks.push({
    name: "config:mcp",
    ok: config.mcp?.argus?.type === "local" && config.mcp?.argus?.enabled !== false,
    detail: file,
  });
  const instruction = path.join(root, "instructions", "argus.md");
  checks.push({
    name: "config:instructions",
    ok: Array.isArray(config.instructions) && config.instructions.includes(instruction),
    detail: instruction,
  });
  checkFile(checks, "command:/argus", path.join(root, "commands", "argus.md"));
  checkFile(checks, "instructions:argus", instruction);
  for (const agent of ["correctness", "security", "performance", "architecture", "tests", "challenger"]) {
    checkFile(checks, `agent:${agent}`, path.join(root, "agents", `argus-${agent}.md`));
  }
  for (const skill of [
    "full-review", "correctness-review", "security-review", "performance-review",
    "architecture-review", "tests-review", "challenger-validation",
  ]) {
    checkFile(checks, `skill:${skill}`, path.join(root, "skills", skill, "SKILL.md"));
  }
  checks.push({ name: "mcp:handshake", ...handshake(config.mcp?.argus?.command) });

  const result = { ok: checks.every((check) => check.ok), config: file, checks };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

try {
  doctor();
} catch (error) {
  console.error(`Argus OpenCode Desktop doctor failed: ${error.message}`);
  process.exitCode = 1;
}
