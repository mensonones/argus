/**
 * The canonical plugin targets Claude Code. Remove what only that host
 * understands before copying text to another host: the `allowed-tools`
 * frontmatter key (plugin-namespaced MCP tool names) and any block fenced with
 * `<!-- claude-code-only -->` … `<!-- /claude-code-only -->` (for example the
 * `${CLAUDE_SESSION_ID}` and `${CLAUDE_PLUGIN_ROOT}` substitutions, which other
 * hosts would print literally).
 */
export function stripClaudeCodeOnly(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^allowed-tools:.*\n/m, "")
    .replace(/^<!-- claude-code-only -->\n[\s\S]*?^<!-- \/claude-code-only -->\n?/gm, "");
}
