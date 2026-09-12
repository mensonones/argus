#!/usr/bin/env node
/**
 * Generate the Codex, OpenCode, and DeepSeek Harness (DSH) host artifacts from
 * the canonical Claude Code plugin (agents/, skills/, commands/). Keeping one
 * source of truth avoids the drift that hand-maintained per-host copies suffer.
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
 *   plugins/argus-dsh/package.json      # DSH profile bundle manifest
 *   plugins/argus-dsh/cordis.patch.yml  # DSH profile bundle patch
 *   plugins/argus-dsh/skills/<name>/SKILL.md
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
// Keep Claude marketplace release metadata aligned with the runtime package.
const releaseVersion = JSON.parse(read(path.join(pluginDir, "package.json"))).version;
const claudeMarketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
const claudeMarketplace = JSON.parse(read(claudeMarketplacePath));
claudeMarketplace.version = releaseVersion;
for (const entry of claudeMarketplace.plugins) {
  if (entry.name === "argus") entry.version = releaseVersion;
}
write(claudeMarketplacePath, JSON.stringify(claudeMarketplace, null, 2) + "\n");
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

// --- DeepSeek Harness (DSH) -------------------------------------------------
//
// DSH has no marketplace and no Markdown agents/commands. A DSH host integration
// is a *profile bundle*: an npm package whose `dsh.bundle.patch` names a loader
// patch, plus skills discovered from the skill roots. So Argus's DSH target is:
//
//   * one `dsh-tool-subagent` row per canonical agent, each spawning a child on
//     the in-process `spawn` backend with that reviewer's persona. The child
//     joins the caller's composition, so it also sees the Argus MCP tools and
//     the Argus skills.
//   * the canonical skills rewritten for this host: MCP tools are namespaced
//     (`mcp__argus__<tool>`), and the specialist names become the model-facing
//     tool names above.
//
// Machine-specific wiring (the absolute path to the MCP launcher) is deliberately
// NOT here: a profile patch cannot resolve a path relative to its own package, so
// `scripts/install-dsh.mjs` writes that row into the user's patch layer.

const DSH_MCP_PREFIX = "mcp__argus__";

// Must stay in sync with the MCP server's tools/list. `doctor-dsh.mjs` checks it.
const DSH_MCP_TOOLS = [
  "argus_init",
  "argus_record_reviewer_run",
  "argus_record_finding",
  "argus_record_challenge",
  "argus_reconcile",
  "argus_baseline_findings",
  "argus_list_findings",
  "argus_query_similar",
  "argus_memory_search",
  "argus_import_baseline",
  "argus_update_global_memory",
  "argus_suppress_finding",
  "argus_list_suppressions",
  "argus_report",
];

const dshDir = path.join(repoRoot, "plugins", "argus-dsh");
const dshSkillsDir = path.join(dshDir, "skills");

// A word boundary does not exist between `_` and a letter, so an already
// namespaced `mcp__argus__argus_init` is left untouched.
function toDsh(text) {
  let out = text;
  for (const tool of DSH_MCP_TOOLS) {
    out = out.replace(new RegExp(`\\b${tool}\\b`, "g"), `${DSH_MCP_PREFIX}${tool}`);
  }
  // Specialist names become the DSH tool names (`argus-correctness` → `argus_correctness`).
  out = out.replace(/\bargus-(correctness|security|performance|architecture|challenger)\b/g,
    (_m, lens) => `argus_${lens}`);
  // DSH exposes the specialists as tools, not as named subagents.
  return out
    .replaceAll("specialist subagents", "specialist reviewer tools")
    .replaceAll("If the host cannot launch subagents", "If these reviewer tools are unavailable");
}

const dshLensTools = agentNames.map((name) => name.replace(/-/g, "_"));

function dshPreamble() {
  return [
    "> **DSH host.** This skill runs on the DeepSeek Harness. Argus is reached",
    `> through MCP, so every Argus tool is namespaced \`${DSH_MCP_PREFIX}<tool>\``,
    `> (for example \`${DSH_MCP_PREFIX}argus_init\`). The specialist reviewers and`,
    "> the adversary are model-facing tools that carry their own reviewer persona:",
    `> ${dshLensTools.map((t) => `\`${t}\``).join(", ")}. Call them as tools —`,
    "> they replace the named subagents of the other hosts and inherit the Argus",
    "> skills and MCP tools.",
  ].join("\n");
}

function injectDshPreamble(text) {
  const lines = text.split("\n");
  const heading = lines.findIndex((line) => line.startsWith("# "));
  const block = dshPreamble().split("\n");
  if (heading === -1) return `${block.join("\n")}\n\n${text}`;
  lines.splice(heading + 1, 0, "", ...block);
  return lines.join("\n");
}

function yamlBlock(text, indent) {
  const pad = " ".repeat(indent);
  return text
    .split("\n")
    .map((line) => (line.length === 0 ? "" : `${pad}${line}`))
    .join("\n");
}

// The bundle manifest. `dsh.bundle.patch` is the whole activation contract: a
// profile that lists this package in `dsh.profile.bundles` applies the patch.
const dshVersion = JSON.parse(read(path.join(pluginDir, "package.json"))).version;
write(
  path.join(dshDir, "package.json"),
  JSON.stringify(
    {
      name: "@argus/dsh-plugin",
      version: dshVersion,
      description:
        "Argus multi-perspective code review for the DeepSeek Harness: specialist reviewer subagent tools plus the DSH-shaped Argus skills.",
      license: "MIT",
      type: "module",
      files: ["cordis.patch.yml", "skills", "README.md"],
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    },
    null,
    2,
  ) + "\n",
);

// The bundle patch: one delegation tool per canonical agent.
const dshRows = [];
for (const file of agentFiles) {
  const { data, body } = parseFrontmatter(read(path.join(agentsDir, file)));
  const name = data.name ?? path.basename(file, ".md");
  dshRows.push({
    id: `argus-subagent-${name.replace(/^argus-/, "")}`,
    tool: name.replace(/-/g, "_"),
    persona: toDsh(body),
  });
}

const dshPatch =
  `# Argus for the DeepSeek Harness — DSH profile bundle patch.\n` +
  `#\n` +
  `# GENERATED FILE — do not edit by hand. Source: plugins/argus/agents/*.md\n` +
  `# Regenerate with \`npm run gen-hosts\`. Install with \`npm run install:dsh\`.\n` +
  `#\n` +
  `# One delegation tool per Argus specialist. Each spawns a child on the\n` +
  `# in-process \`spawn\` backend carrying that reviewer's persona; the child joins\n` +
  `# the caller's composition, so it also sees the Argus MCP tools and skills.\n` +
  `# \`maxDepth: 1\` lets the coordinator (depth 0) start a reviewer (depth 1) while\n` +
  `# stopping that reviewer from delegating further, and background calls stay\n` +
  `# enabled so independent lenses can run in parallel.\n` +
  `- insert:\n` +
  dshRows
    .map(
      (row) =>
        `    - id: ${row.id}\n` +
        `      name: '@deepseek-ai/dsh-tool-subagent'\n` +
        `      config:\n` +
        `        provider: spawn\n` +
        `        toolName: ${row.tool}\n` +
        `        backgroundMode: one-shot\n` +
        `        maxDepth: 1\n` +
        `        persona: |-\n` +
        `${yamlBlock(row.persona, 10)}\n`,
    )
    .join("\n");
write(path.join(dshDir, "cordis.patch.yml"), dshPatch);

// The DSH-shaped skills, copied so a bundle resource stays with its skill.
//
// DSH skill names must be kebab-case, so Claude Code's `/argus:review` cannot
// exist here. The coordinator's DSH copy carries the Argus brand instead, which
// makes the slash entry point `/argus-review`; the lens skills keep their
// canonical names.
const DSH_SKILL_NAMES = { "full-review": "argus-review" };

fs.rmSync(dshSkillsDir, { recursive: true, force: true });
let dshSkillCount = 0;
for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const src = path.join(skillsDir, entry.name);
  const skillFile = path.join(src, "SKILL.md");
  if (!fs.existsSync(skillFile)) continue;
  const dshName = DSH_SKILL_NAMES[entry.name] ?? entry.name;
  let text = toDsh(read(skillFile));
  if (dshName !== entry.name) {
    // The catalog entry name is the frontmatter `name`, so it must move too.
    text = text.replace(`\nname: ${entry.name}\n`, `\nname: ${dshName}\n`);
  }
  const dest = path.join(dshSkillsDir, dshName);
  fs.cpSync(src, dest, { recursive: true, force: true });
  write(path.join(dest, "SKILL.md"), `${injectDshPreamble(text).trimEnd()}\n`);
  dshSkillCount += 1;
}

console.log(
  `Generated hosts: ${agentNames.length} agents → Codex TOML + OpenCode md, ` +
    `skills + command + opencode.json`,
);
console.log(
  `Generated DSH: ${dshRows.length} subagent tools + ${dshSkillCount} skills → ` +
    `plugins/argus-dsh (bundle @argus/dsh-plugin)`,
);
