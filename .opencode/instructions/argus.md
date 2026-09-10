# Argus

Argus performs agentic multi-perspective code review with an adversarial
challenger. When the user asks to review a change, run the `full-review`
skill / the `/argus` command. Prefer the Argus MCP tools (`argus_*`); fall
back to the `argus` CLI. Findings and memory live in `.argus/`.

Specialist subagents: `argus-architecture`, `argus-challenger`, `argus-correctness`, `argus-performance`, `argus-security`.
