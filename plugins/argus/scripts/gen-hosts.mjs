#!/usr/bin/env node
/**
 * Generate the Codex and OpenCode host artifacts from the canonical Claude Code
 * plugin (agents/, skills/, commands/). Keeping one source of truth avoids the
 * drift that hand-maintained per-host copies suffer.
 *
 * Run from the repo root or anywhere: `node plugins/argus/scripts/gen-hosts.mjs`
 *
 * Emits, at the repo root:
 *   .agents/plugins/marketplace.json
 *   .codex/agents/<name>.toml
 *   .opencode/agents/<name>.md
 *   .opencode/skills/<name>/SKILL.md
 *   .opencode/commands/argus.md
 *   .opencode/instructions/argus.md
 *   opencode.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, "..");
const repoRoot = path.resolve(pluginDir, "..", "..");

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text.trim() };
  const data = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (mm) data[mm[1]] = mm[2].trim();
  }
  // Support folded multi-line description values (indented continuation lines).
  return { data, body: m[2].trim() };
}

function read(p) {
  return fs.readFileSync(p, "utf8");
}
function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}
function tomlEscape(s) {
  return s.replace(/"""/g, '\\"\\"\\"');
}

// --- Agents -----------------------------------------------------------------
const agentsDir = path.join(pluginDir, "agents");
const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
const agentNames = [];

for (const file of agentFiles) {
  const { data, body } = parseFrontmatter(read(path.join(agentsDir, file)));
  const name = data.name ?? path.basename(file, ".md");
  const description = data.description ?? "";
  agentNames.push(name);

  // Codex TOML
  const toml =
    `name = "${name}"\n` +
    `description = "${description.replace(/"/g, '\\"')}"\n` +
    `reasoning_effort = "high"\n` +
    `sandbox_mode = "read-only"\n\n` +
    `instructions = """\n${tomlEscape(body)}\n"""\n`;
  write(path.join(repoRoot, ".codex", "agents", `${name}.toml`), toml);

  // OpenCode agent markdown (subagent, read-only tools)
  const oc =
    `---\n` +
    `description: ${description}\n` +
    `mode: subagent\n` +
    `tools:\n  write: false\n  edit: false\n` +
    `---\n\n${body}\n`;
  write(path.join(repoRoot, ".opencode", "agents", `${name}.md`), oc);
}

// --- Codex marketplace ------------------------------------------------------
const codexMarketplace = {
  name: "argus-marketplace",
  interface: { displayName: "Argus" },
  plugins: [{
    name: "argus",
    source: { source: "local", path: "./plugins/argus" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: "Developer Tools",
  }],
};
write(
  path.join(repoRoot, ".agents", "plugins", "marketplace.json"),
  JSON.stringify(codexMarketplace, null, 2) + "\n",
);

// --- Skills (copied recursively; SKILL.md and its resources are shared) -----
const skillsDir = path.join(pluginDir, "skills");
for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const src = path.join(skillsDir, entry.name);
  if (!fs.existsSync(path.join(src, "SKILL.md"))) continue;
  fs.cpSync(src, path.join(repoRoot, ".opencode", "skills", entry.name), {
    recursive: true,
    force: true,
  });
}

// --- Command ----------------------------------------------------------------
const cmdSrc = path.join(pluginDir, "commands", "review.md");
if (fs.existsSync(cmdSrc)) {
  write(path.join(repoRoot, ".opencode", "commands", "argus.md"), read(cmdSrc));
}

// --- OpenCode instructions + config ----------------------------------------
const instructions =
  `# Argus\n\n` +
  `Argus performs agentic multi-perspective code review with an adversarial\n` +
  `challenger. When the user asks to review a change, run the \`full-review\`\n` +
  `skill / the \`/argus\` command. Prefer the Argus MCP tools (\`argus_*\`); fall\n` +
  `back to the \`argus\` CLI. Findings and memory live in \`.argus/\`.\n\n` +
  `Specialist subagents: ${agentNames.map((n) => `\`${n}\``).join(", ")}.\n`;
write(path.join(repoRoot, ".opencode", "instructions", "argus.md"), instructions);

const opencodeJson = {
  $schema: "https://opencode.ai/config.json",
  mcp: {
    argus: {
      type: "local",
      command: ["argus-mcp"],
      enabled: true,
      timeout: 15000,
    },
  },
  instructions: [".opencode/instructions/argus.md"],
  permission: { skill: { "*review*": "allow", "full-review": "allow" } },
};
write(
  path.join(repoRoot, "opencode.json"),
  JSON.stringify(opencodeJson, null, 2) + "\n",
);

console.log(
  `Generated hosts: ${agentNames.length} agents → Codex TOML + OpenCode md, ` +
    `skills + command + opencode.json`,
);
