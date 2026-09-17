#!/usr/bin/env node
// Install Argus reviewer/challenger personas as Codex custom agents in the
// user's personal ~/.codex/agents/ directory (TOML, per the Codex subagents
// spec). Interactive Codex sessions can then invoke them by name.
//
// Note on tool-backed sessions (openai/codex#15250): spawn_agent cannot select
// custom agents by name there, so the Argus coordinator reads each agent's
// developer_instructions and injects them into a generic worker — disclosed as
// a generic agent with injected instructions, never a host-loaded role.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAgents, buildCodexAgentToml } from "./lib/codex-agents.mjs";

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentsHome = path.join(os.homedir(), ".codex", "agents");
fs.mkdirSync(agentsHome, { recursive: true });

const written = [];
for (const agent of loadAgents(pluginDir)) {
  fs.writeFileSync(
    path.join(agentsHome, `${agent.name}.toml`),
    buildCodexAgentToml(agent),
    "utf8",
  );
  written.push(agent.name);
}

console.log(`Installed ${written.length} Codex custom agents in ${agentsHome}`);
console.log("  " + written.join(", "));
console.log("");
console.log("Interactive Codex: invoke by name, e.g. \"have argus-security review src/\".");
console.log("Tool-backed sessions (openai/codex#15250): the coordinator injects each agent's");
console.log("developer_instructions into a generic worker and discloses it as such.");
console.log("");
console.log("Also register the plugin + MCP if you have not:");
console.log("  codex plugin add argus@argus-marketplace");
