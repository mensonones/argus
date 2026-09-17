#!/usr/bin/env node
// Verify the Argus Codex custom agents are installed correctly in
// ~/.codex/agents/ and that the plugin is registered. Exits non-zero if any
// expected agent file is missing or malformed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAgents } from "./lib/codex-agents.mjs";

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentsHome = path.join(os.homedir(), ".codex", "agents");
const configPath = path.join(os.homedir(), ".codex", "config.toml");

const checks = [];
for (const { name } of loadAgents(pluginDir)) {
  const file = path.join(agentsHome, `${name}.toml`);
  if (!fs.existsSync(file)) {
    checks.push({ name: `agent:${name}`, ok: false, detail: "not installed — run `npm run install:codex`" });
    continue;
  }
  const t = fs.readFileSync(file, "utf8");
  const hasAll =
    /(^|\n)name\s*=/.test(t) &&
    /(^|\n)description\s*=/.test(t) &&
    /developer_instructions\s*=\s*"""/.test(t);
  checks.push({
    name: `agent:${name}`,
    ok: hasAll,
    detail: hasAll ? file : "missing required fields (name/description/developer_instructions)",
  });
}

// Plugin registration is informational: it may be under a different marketplace.
let pluginOk = false;
let pluginDetail = "argus plugin not found in ~/.codex/config.toml — run `codex plugin add argus@argus-marketplace`";
if (fs.existsSync(configPath) && /\[plugins\."argus@/.test(fs.readFileSync(configPath, "utf8"))) {
  pluginOk = true;
  pluginDetail = "argus plugin registered in ~/.codex/config.toml";
}
checks.push({ name: "plugin:registered", ok: pluginOk, detail: pluginDetail, informational: true });

const agentsOk = checks.filter((c) => c.name.startsWith("agent:")).every((c) => c.ok);
console.log(JSON.stringify({ ok: agentsOk, agentsHome, checks }, null, 2));
process.exit(agentsOk ? 0 : 1);
