#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
} from "jsonc-parser";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(here, "..");
const repoRoot = path.resolve(pluginDir, "..", "..");
const generatedDir = path.join(repoRoot, ".opencode");
const mcpScript = path.join(pluginDir, "dist", "bin", "argus-mcp.js");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function resolveConfigDir() {
  const explicit = argumentValue("--config-dir");
  if (explicit) return path.resolve(explicit);
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg
    ? path.join(path.resolve(xdg), "opencode")
    : path.join(os.homedir(), ".config", "opencode");
}

function selectConfigFile(configDir) {
  const json = path.join(configDir, "opencode.json");
  const jsonc = path.join(configDir, "opencode.jsonc");
  if (fs.existsSync(json) && fs.existsSync(jsonc)) {
    throw new Error(
      `Both ${json} and ${jsonc} exist. Keep only the active global config and retry.`,
    );
  }
  return fs.existsSync(jsonc) ? jsonc : json;
}

function update(text, propertyPath, value) {
  return applyEdits(
    text,
    modify(text, propertyPath, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
    }),
  );
}

function copyDefinitions(configDir) {
  for (const directory of ["agents", "commands", "skills", "instructions"]) {
    const source = path.join(generatedDir, directory);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing generated OpenCode directory: ${source}`);
    }
    fs.cpSync(source, path.join(configDir, directory), {
      recursive: true,
      force: true,
    });
  }
}

function install() {
  if (!fs.existsSync(mcpScript)) {
    throw new Error(`Missing ${mcpScript}. Build Argus before installing.`);
  }

  const configDir = resolveConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  const configFile = selectConfigFile(configDir);
  const existed = fs.existsSync(configFile);
  const original = existed ? fs.readFileSync(configFile, "utf8") : "{}\n";
  const errors = [];
  parse(original, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const details = errors
      .map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`)
      .join(", ");
    throw new Error(`Cannot safely update ${configFile}: ${details}`);
  }

  copyDefinitions(configDir);

  let next = original;
  next = update(next, ["$schema"], "https://opencode.ai/config.json");
  next = update(next, ["mcp", "argus"], {
    type: "local",
    command: [process.execPath, mcpScript],
    enabled: true,
    timeout: 15000,
  });
  next = update(next, ["permission", "skill", "*review*"], "allow");
  next = update(next, ["permission", "skill", "full-review"], "allow");

  const parsed = parse(next, [], { allowTrailingComma: true });
  const instruction = path.join(configDir, "instructions", "argus.md");
  const instructions = Array.isArray(parsed.instructions) ? parsed.instructions : [];
  if (!instructions.includes(instruction)) {
    next = update(next, ["instructions"], [...instructions, instruction]);
  }

  if (existed && next !== original) {
    const backup = `${configFile}.argus-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(configFile, backup);
    console.log(`Backed up existing config: ${backup}`);
  }
  fs.writeFileSync(configFile, next.endsWith("\n") ? next : `${next}\n`, "utf8");

  console.log(`Installed Argus definitions in: ${configDir}`);
  console.log(`Updated OpenCode Desktop config: ${configFile}`);
  console.log("Restart OpenCode Desktop, open a Git project, and run /argus.");
}

try {
  install();
} catch (error) {
  console.error(`Argus installation failed: ${error.message}`);
  process.exitCode = 1;
}
