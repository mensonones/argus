// Shared Codex custom-agent helpers, used by gen-hosts.mjs (repo-scoped
// .codex/agents) and install-codex.mjs (personal ~/.codex/agents). One source
// avoids drift between the generated and installed agent definitions.
//
// Schema: learn.chatgpt.com/docs/agent-configuration/subagents
//   name, description, developer_instructions (required);
//   model_reasoning_effort, sandbox_mode (optional).
import fs from "node:fs";
import path from "node:path";

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text.trim() };
  const data = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (mm) data[mm[1]] = mm[2].trim();
  }
  return { data, body: m[2].trim() };
}

/** Load the canonical reviewer agents with persona-prefixed descriptions. */
export function loadAgents(pluginDir) {
  const agentsDir = path.join(pluginDir, "agents");
  const personaCatalog = JSON.parse(
    fs.readFileSync(path.join(pluginDir, "src", "personas.json"), "utf8"),
  );
  return fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const { data, body } = parseFrontmatter(
        fs.readFileSync(path.join(agentsDir, file), "utf8"),
      );
      const name = data.name ?? path.basename(file, ".md");
      const persona = Object.values(personaCatalog).find((p) => p.agent === name);
      if (!persona) throw new Error(`No display persona for agent ${name}`);
      return { name, description: `${persona.name} — ${data.description ?? ""}`, body };
    });
}

/** Render one Codex custom-agent TOML file. */
export function buildCodexAgentToml({ name, description, body }) {
  const escBlock = (s) => s.replace(/"""/g, '\\"\\"\\"');
  return (
    `name = "${name}"\n` +
    `description = "${description.replace(/"/g, '\\"')}"\n` +
    `model_reasoning_effort = "high"\n` +
    `sandbox_mode = "read-only"\n\n` +
    `developer_instructions = """\n${escBlock(body)}\n"""\n`
  );
}
