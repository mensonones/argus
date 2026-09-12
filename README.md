# Argus

**Agentic multi-perspective code review — as a plugin for your AI coding assistant.**

> Many eyes. Fewer false positives.

Argus reviews a code change from several specialist perspectives at once —
Correctness, Security, Performance, Architecture — then runs an adversarial
**Challenger** that tries to prove each finding wrong before it reaches you. The
result is a short list of findings backed by evidence, not a wall of speculative
comments.

The name comes from **Argus Panoptes**, the many-eyed giant of Greek myth who
was always watching.

## Evidence and evaluation

Findings and Challenger verdicts optionally carry an `evidencePackage` v1:
revision, working-tree state, validation method, execution path, preconditions,
expected/observed behavior, limitations and optional negative control. Executed
methods require a command and recorded output/artifact. These are agent-reported
observations, not execution certificates. Legacy findings remain supported.
The ranking no longer rewards evidence text volume or reviewer agreement.

`npm run eval:prepare` emits label-free pilot tasks for your existing assistant.
`npm run eval:score -- /absolute/path/run.json` scores human-adjudicated runs.
See [Argus Eval](eval/README.md) for configurations, format and limitations.
The eight-case synthetic pilot tests the evaluation workflow; it does **not**
establish production review quality. No model API or API key is introduced.

## How it works

Argus is **not** a standalone bot with its own API key. It is a plugin for AI
coding assistants (**Claude Code**, **Codex**, **OpenCode**, **DeepSeek
Harness**). Your assistant is the engine — it runs the reviewers as subagents and
does the reasoning. Argus provides:

- **Specialist reviewer subagents** — one bounded lens each.
- **A Challenger subagent** — the adversarial validation stage.
- **Skills** — the methodology, heuristics, and validation gates each reviewer
  loads.
- **A coordinator command** (`/argus:review`) — drives the whole cycle.
- **A deterministic MCP runtime** (+ `argus` CLI) — owns the git diff, the shared
  finding memory, deduplication, ranking, and the report. State lives in
  `.argus/` (SQLite), so reviewers coordinate and Argus remembers past rounds.

```
/argus:review
   │
   ▼
argus_init            detect repo · committed + working-tree diff · open a round
   │
   ▼
select reviewers      (skip pure docs/config/asset changes)
   │
   ├── argus-correctness ─┐   each a subagent using the host's Read/Grep/git
   ├── argus-security     │   + argus_record_finding to store evidence-backed
   ├── argus-performance  │   candidate findings in shared memory
   └── argus-architecture ┘
   │
   ▼
argus-challenger       adversarially validates each → CONFIRMED / PLAUSIBLE / REJECTED
   │
   ▼
argus_report           dedup · rank (severity × confidence × challenge × validation) · render
```

## Install

This repo is a plugin **marketplace**. Whatever the host, the deterministic
runtime (the MCP server + `argus` CLI) must be built first.

**Prerequisite (all hosts): Node 22+.** Build the runtime once — it ships a
compiled `dist/` that the MCP server and CLI run from:

```bash
npm run build   # installs deps + builds plugins/argus
```

`plugins/argus/dist/` is committed, so if you install from GitHub the build is
only needed after you change the TypeScript under `plugins/argus/src/`.

> Every host reviews the repo the assistant is open in, and writes memory to
> `<repo>/.argus/`. Add `.argus/` to that repo's `.gitignore`.

---

### Claude Code

**Install** with the `claude` CLI (from any terminal):

```bash
# from a local checkout:
claude plugin marketplace add /absolute/path/to/argus
# …or from GitHub once published:
claude plugin marketplace add mensonones/argus

claude plugin install argus@argus-marketplace
```

Or interactively inside Claude Code: `/plugin marketplace add <path-or-owner/repo>`
then `/plugin install argus@argus-marketplace`.

**Activate:** run `/reload-plugins` in a running session (MCP servers take effect
in the *next* session — restart Claude Code if `/mcp` doesn't list `argus` yet).

**Verify:** `/mcp` shows `argus` connected; `/argus` suggests `/argus:review`.

**Start** — open Claude Code *inside the git repo you want reviewed* and run:

```
/argus:review
/argus:review --base main
/argus:review src/payment/ security only
```

---

### Codex

**Install** from the Codex marketplace contained in this repository:

```bash
codex plugin marketplace add /absolute/path/to/argus
codex plugin add argus@argus-marketplace
```

The Codex marketplace manifest lives at `.agents/plugins/marketplace.json`.
The plugin declares its skills and MCP server in
`plugins/argus/.codex-plugin/plugin.json`.

For a manual development setup, use the generated `.codex/agents/*.toml` at
project scope or copy them to `~/.codex/agents/`. If the host cannot launch
subagents, `full-review` applies the same lenses sequentially in the coordinator.

As an MCP-only fallback, register the runtime in `~/.codex/config.toml`:

```toml
[mcp_servers.argus]
command = "node"
args = ["/absolute/path/to/argus/plugins/argus/scripts/argus-mcp.cjs"]
```

**Start** — from within a git repo, invoke a reviewer agent (`@argus-correctness`,
`@argus-security`, …) or ask Codex to *"run an Argus review of the current
change"*. The agents record findings through the `argus_*` MCP tools and you get
the report via `argus_report`.

---

### OpenCode Desktop (experimental)

The supported target is **OpenCode Desktop**. The terminal CLI is not required
to use Argus. OpenCode Desktop reads the same global `opencode.json` and
configuration directories as the other OpenCode interfaces.

Install OpenCode Desktop from the [official download
page](https://opencode.ai/download), then run the installer from the Argus root:

```bash
cd /absolute/path/to/argus
npm run install:opencode-desktop
```

The installer builds the runtime, copies agents, commands, skills, and
instructions into `~/.config/opencode/`, then safely merges the Argus MCP into
the existing `opencode.json` or `opencode.jsonc`. It preserves unrelated
settings, supports JSONC comments, records absolute executable paths for the
desktop process, and creates a timestamped backup before changing an existing
config. Re-running it updates the same installation without creating duplicate
entries.

Verify the global installation and perform a real MCP handshake with:

```bash
npm run doctor:opencode-desktop
```

Restart OpenCode Desktop, open a Git project, and run `/argus` or ask for a
*"complete Argus review of the current change"*. Argus itself requires no API
key; OpenCode Desktop still needs access to a model through one of its supported
providers.

The OpenCode Desktop artifacts are generated and schema-aligned, but remain
experimental until this installation and review flow is exercised end to end in
a released desktop build.

---

### DeepSeek Harness (DSH)

DSH has no marketplace and no Markdown agents or commands: a profile is an
ordered stack of patch layers, and a **bundle** is an npm package whose
`dsh.bundle.patch` names a loader patch. Argus ships that bundle at
`plugins/argus-dsh`, plus an installer that writes the machine-specific parts.

```bash
cd /absolute/path/to/argus
npm run install:dsh        # build, generate, copy skills, register MCP + bundle
npm run doctor:dsh         # verify artifacts, patch, and a real MCP handshake
```

The installer:

1. copies the Argus skills to `$DSH_HOME/skills` — the user skill root that
   `dsh-skill-filesystem` scans on every surface, the Web GUI's `standard`
   preset included;
2. registers the Argus MCP server in `$DSH_HOME/cordis.patch.yml` as `argus`, so
   its tools appear as `mcp__argus__<tool>`;
3. registers the bundle in the target profile (`--profile`, default `web`) with
   `dsh plugin --profile web add`, which also appends it to `dsh.profile.bundles`.

Restart DSH so the patch applies, open a Git project, and run `/argus-review` — or
ask for an *"Argus review"*. Every DSH skill is slash-invocable, so the entry
point is `/argus-review` (the kebab-case form of Claude Code's `/argus:review`)
and each lens is reachable directly as `/correctness-review`,
`/security-review`, `/performance-review`, `/architecture-review`, and
`/challenger-validation`. The specialists become model-facing tools
(`argus_correctness`, `argus_security`, `argus_performance`,
`argus_architecture`) with `argus_challenger` for adversarial validation; each
carries its reviewer persona and inherits the Argus skills and MCP tools. Without
the bundle (`--skip-bundle`) the coordinator still applies the lenses
sequentially, exactly as documented for hosts without named subagents.

Installer flags: `--profile <name>`, `--dsh-home <dir>`, `--dsh-bin <path>`,
`--dry-run`, `--skip-bundle`.

## The runtime (MCP tools / CLI)

The deterministic pipeline is exposed both as MCP tools (preferred) and a CLI
fallback:

| MCP tool | CLI | Purpose |
|---|---|---|
| `argus_init` | `argus init` | detect repo, committed + working-tree diff, context, open a round |
| `argus_record_finding` | `argus record-finding --json` | store a candidate finding |
| `argus_record_reviewer_run` | `argus reviewer-run <id> <status>` | record reviewer coverage |
| `argus_record_challenge` | `argus challenge <id> <verdict>` | store a verdict |
| `argus_list_findings` | `argus list` | list findings by status |
| `argus_query_similar` | — | dedupe helper |
| `argus_memory_search` | `argus memory <q>` | search past findings |
| `argus_import_baseline` | `argus baseline-import <file>` | import an Argus JSON baseline |
| `argus_suppress_finding` | `argus suppress <id> --reason ...` | suppress a fingerprint with audit metadata |
| `argus_list_suppressions` | `argus suppressions` | inspect active/expired suppressions |
| `argus_report` | `argus report` | dedup, rank, render, export |

Memory: per-target `<repo>/.argus/memory.sqlite`, plus confirmed findings promoted
to cross-target `~/.argus/global.sqlite`. Uses Node's built-in `node:sqlite` (Node 22+). Add
`.argus/` to your `.gitignore`.

SQLite runs in WAL mode with bounded busy retries, and schema migrations are
applied idempotently. Reports compare against the previous reported round and
any imported JSON baseline, classify findings as `new`, `persistent`, or
`regression`, and list findings resolved since the previous review. Suppressions
require a reason, can expire, and are retained for audit.

## Configuration (`argus.yaml`)

Optional, per project. Generate a starter with `argus config-init`. The runtime
reads it at `argus_init` (which reviewers are enabled, `ignore` globs,
architecture rules) and `argus_report` (severity floor, `max_findings`).

```yaml
reviewers:
  correctness: true
  security: true
  performance: true
  architecture: true
  tests: false
severity:
  minimum: low
review:
  max_findings: 20
ignore:
  - "**/*.generated.*"
  - "**/vendor/**"
architecture:
  rules:
    - "domain must not depend on infrastructure"
```

## Design principles

- **Evidence over speculation** — every finding cites the code, the triggering
  scenario, the impact, and a confidence level.
- **Signal over noise** — few useful findings, not many shallow ones; no style
  nits a linter/formatter would catch.
- **Multiple perspectives** — no single agent tries to see everything.
- **Adversarial validation** — nothing reaches the report until the Challenger
  has tried to refute it.

## Repository layout

```
.claude-plugin/marketplace.json     # marketplace manifest
.agents/plugins/marketplace.json    # Codex marketplace manifest
plugins/argus/
  .claude-plugin/plugin.json         # Claude Code plugin
  .codex-plugin/plugin.json          # Codex plugin
  .mcp.json                          # MCP server registration
  agents/                            # reviewer + challenger subagents
  commands/review.md                 # /argus:review coordinator
  skills/                            # methodology + heuristics + gates
  templates/                         # finding + report templates
  scripts/argus-mcp.cjs              # MCP launcher
  scripts/gen-hosts.mjs              # regenerates Codex/OpenCode/DSH from canon
  scripts/install-dsh.mjs            # DSH installer
  scripts/doctor-dsh.mjs             # DSH diagnostics
  src/                               # TypeScript runtime (MCP + CLI + SQLite)
plugins/argus-dsh/                   # DSH profile bundle (@argus/dsh-plugin)
  cordis.patch.yml                   # generated specialist subagent tools
  skills/                            # generated DSH-shaped skills
.codex/agents/                       # generated Codex mirror
.opencode/                           # generated OpenCode mirror
opencode.json
```

The Codex, OpenCode, and DSH artifacts are **generated** from the canonical
Claude Code plugin — run `npm run gen-hosts` after editing an agent, skill, or
command.

## Status

**v0.1 alpha** — CLI + MCP runtime, git diff, context, four reviewers, challenger,
dedup + ranking, resilient/versioned SQLite memory, baseline/suppression,
reports, and Claude Code / Codex / OpenCode Desktop / DSH packaging and
diagnostics. Roadmap: Tests reviewer, stack-specific skills, GitHub Action, and
broader live host validation.

## License

MIT
