#!/usr/bin/env node
/**
 * Claude Code / Codex MCP launcher for Argus.
 *
 * Referenced from .mcp.json as:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/argus-mcp.cjs
 *
 * Loads the compiled ESM server. Requires the plugin to be built (`dist/`).
 */
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs");

const entry = path.join(__dirname, "..", "dist", "bin", "argus-mcp.js");

if (!fs.existsSync(entry)) {
  console.error(
    "[argus] dist not found. Build the plugin first: (cd plugins/argus && npm install && npm run build)",
  );
  process.exit(1);
}

import(pathToFileURL(entry).href).catch((err) => {
  console.error("[argus] failed to start MCP server:", err);
  process.exit(1);
});
