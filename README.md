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

Current version: **0.3.0-alpha.5** — [Project status](#status) · [Changelog](CHANGELOG.md).

### New in v0.3.0-alpha.5

Subagents share the coordinator's repository and round explicitly with
`repo_path` + `round_id`. Attach without creating another round; wrong or stale
context fails rather than silently changing targets. See [Sharing a round with
subagents](#sharing-a-round-with-subagents). Reinstall and start a fresh session.

### New in v0.3.0-alpha.4

Challenger instructions require real delegation when available and explicit
coordinator fallback otherwise. Verdicts record execution provenance, disclosed
in readable reports; older verdicts are unspecified. These records do not
certify independence. Reinstall host definitions and start a fresh session.

### New in v0.3.0-alpha.3

Named specialist personas now appear in delegations and readable reports;
technical agent IDs remain stable. See [Personas](#personas). Reinstall your host
definitions and start a new session to load the updated instructions.

### New in v0.2.6

- Compact baseline queries: `argus baseline-list --file src/accounts.js --limit 20`.
  Follow `nextOffset` using `--offset`; retrieve evidence with `--finding-id <id>`.
- Reconciliation confirms the historical links actually applied to each group.
- Report generation blocks reviewers still `started`; record completion or failure first.

### New in v0.3.0-alpha.1

Tests Reviewer is available for all four hosts, opt-in:

```yaml
reviewers:
  tests: true
```

The coordinator selects `argus-tests` for changed tests/setup or concrete
reliability concerns. It checks assertions, async failure observation, mocks and
isolation; missing coverage alone is not a finding. Candidates still require
Challenger validation and reconciliation. Reinstall your host definitions and
restart in a new session to load it. Version alpha.2 adds JS/TS stack detection
and the first two stack supplements described below.

## Evidence and evaluation

Since v0.3.0-alpha.2, `argus_init.stack` exposes declared framework, test-runner and
package-manager hints from the root and affected JS/TS package manifests. Each
signal names its source file and field; these are not verified runtime usage.
Inspection is limited to 64 affected directories and 1 MiB per manifest, with
warnings/truncation disclosed. Sibling packages and dependency trees are not
scanned. Broader ecosystem detection remains planned.

The first stack supplements are `react-review` (state/effects)
and `node-test-review` (Node runner assertion observation and isolation).
`argus_init.stackSkills` suggests them for the nearest inspected package and
enabled lenses only. Confirm actual code/runner usage before loading; a manifest
declaration is not enough. They preserve the specialist category and Challenger
workflow, and do not enable reviewers. Reinstall host definitions and start a
new session after upgrading. Live React review quality remains unvalidated.

The [Codex Tests Reviewer lab observation](eval/observations/2026-09-17-codex-tests-lab.md)
validates one synthetic workflow, not general review quality.

Findings and Challenger verdicts optionally carry an `evidencePackage` v1:
revision, working-tree state, validation method, execution path, preconditions,
expected/observed behavior, limitations and optional negative control. Executed
methods require a command and recorded output/artifact. These are agent-reported
observations, not execution certificates. Legacy findings remain supported.
The ranking no longer rewards evidence text volume or reviewer agreement.

Challenger-validated `rootCause` triples describe symbol, mechanism and violated
invariant. Current-round consolidation requires explicit reconciliation, based
on causal evidence rather than invariant labels or line proximity. Legacy
title/location heuristics remain only for historical matching.

The Challenger can submit a `correction` with revised claim-bearing content,
a reason and a replacement evidence packet. Original content stays in the
SQLite/JSON audit history; reports show corrected claims and correction reasons.
Correcting an exaggeration is different from rejecting a real defect or
suppressing a finding. These corrections ship in version 0.2.1.

`npm run eval:prepare` emits label-free pilot tasks for your existing assistant.
`npm run eval:score -- /absolute/path/run.json` scores human-adjudicated runs.
See [Argus Eval](eval/README.md) for configurations, format and limitations.
The eight-case synthetic pilot tests the evaluation workflow; it does **not**
establish production review quality. No model API or API key is introduced.

## How it works

### Sharing a round with subagents

Only the coordinator creates a review with `argus_init`. Pass its returned
`repoRoot` and `roundId` to all specialists and the Challenger as `repo_path`
and `round_id` on every MCP call. A fresh MCP instance can operate with this
explicit pair, or attach via `argus_init` using only the pair (no diff options).
Attach does not create a round. Wrong, abandoned or superseded rounds fail
rather than silently changing targets. A completed round is readable but does
not accept new findings/verdicts. Children must share access to the same `.argus`
database; this does not bridge filesystem isolation or bypass host permissions.
Stop on context errors; do not reconstruct candidates to conceal failed writes.

### Personas

Argus coordinates the named personas below. These display names appear in
delegation instructions and readable reports; runtime IDs remain unchanged.

| Persona | Role | Technical agent ID |
| --- | --- | --- |
| Atena | Correctness | `argus-correctness` |
| Cerbero | Security | `argus-security` |
| Hermes | Performance | `argus-performance` |
| Dedalo | Architecture | `argus-architecture` |
| Temis | Tests | `argus-tests` |
| Momo | Challenger | `argus-challenger` |

`argus_init.personas` exposes the display catalog, independently of enabled
lenses. JSON/SQLite keep technical reviewer IDs. A host can still assign an
instance a different name, such as Cicero; Argus does not control that label.
A persona name alone is not evidence that its agent instructions were loaded.
Since v0.3.0-alpha.4, instructions require actual Challenger delegation when available and
disclosure of any coordinator fallback. Verdict execution metadata records a
host child ID or fallback reason; readable reports disclose unspecified legacy
execution. These are agent-reported records, not host-certified independence.
CLI: `argus challenge <id> CONFIRMED --reason "..." --execution
'{"mode":"coordinator","detail":"Host delegation unavailable; validation instructions loaded"}'`.
These personas ship in v0.3.0-alpha.3; reinstall host definitions and start a
new session after upgrading.

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
select reviewers      (skip docs/assets/ignored files; configuration may be reviewed)
   │
   ├── argus-correctness ─┐   each a subagent using the host's Read/Grep/git
   ├── argus-security     │   + argus_record_finding to store evidence-backed
   ├── argus-performance  │   candidate findings in shared memory
   └── argus-architecture ┘
   │
   ▼
argus-challenger       validate claims · correct overstatements · identify root causes
   │
   ▼
argus_reconcile        required canonical/member IDs · reviewed categories · claim reconciliation
   │
   ▼
argus_report           explicit groups · rank (severity × confidence × challenge × validation) · render
```

## Reconciliation and baseline

Version 0.2.5: reconciliation accepts `incorporated_baselines` entries with
historical `finding_id`, `reasoning` and nonempty `covered_claims`. Use them when
a verified consequence formerly reported separately is preserved in current
canonical content, not when it was fixed or discarded. Reports expose
`incorporatedBaselineCount` and `incorporatedBaselineFindings`, with destination
IDs, without marking that history not-redetected. Coverage must be verified
each round; the runtime checks references/conflicts, not semantic completeness.

Version 0.2.4 guidance clarifies disputed finding splits: compare causal
preconditions, contracts and observable consequences, using targeted controls
when practical. Challenger votes, invariant names and examples are not evidence
of independence. One root cause may have several consequences in one finding.
`NEW` means newly identified against history, not newly introduced in code.
The [DSH lab note](eval/observations/2026-09-12-dsh-lab.md) remains unscored and
records the subsequent maintainer-approved grouping; it does not establish a
fourth ground-truth defect or a scored model evaluation.

Version 0.2.3 baseline improvements preserve canonical groups across rounds.
`argus_baseline_findings` / `argus baseline-list` exposes previous, historical and
imported findings. Reconciliation can include `baseline_match` with a historical
`finding_id` and semantic-equivalence `reasoning` to preserve `baselineIdentity`
despite changed wording/category. The runtime checks existing IDs, same file and
one identity per current defect; semantic truth remains the coordinator's job.
Distinct validated root causes do not automatically match by title or line.
Reported history includes filtered/suppressed canonical findings, not raw duplicates.

Version 0.2.2 requires explicit reconciliation before reporting.
Each group supplies `canonical_id`, `members` (`finding_id`, reviewed `category`),
`rootCause`, `reasoning` and `claims_reviewed: true`. Every surviving ID must occur
once; use `[]` when none survive. The coordinator reviews semantics and corrects
canonical claims first; the runtime checks coverage, retains provenance and
blocks stale plans after any finding/verdict/correction change. It does not
certify semantic equivalence or union duplicate prose. Missing/invalid finding
categories now fail. When upgrading from 0.2.1, rebuild/reinstall your host
integration and restart the host before retesting.

Historical findings absent from a later review are labeled **not redetected**,
not resolved: absence or a changed fingerprint is not proof of a fix. JSON exposes
`unmatchedPreviousCount` and `unmatchedPreviousFindings`; legacy `resolvedCount`
and `resolvedFindings` remain zero/empty until fix verification is supported.

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

An initial synthetic end-to-end OpenCode Desktop review found the three
prepared defects and left two changed negative controls clean. It exposed
cross-lens duplication and unremoved overstatements, motivating the current
root-cause/correction work. This is a smoke test, not broad host certification
or proof of production-quality precision/recall; support remains experimental.

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
| `argus_record_challenge` | `argus challenge <id> <verdict>` | store verdict, validated root cause and optional correction |
| `argus_list_findings` | `argus list` | list findings by status |
| `argus_query_similar` | — | dedupe helper |
| `argus_memory_search` | `argus memory <q>` | search past findings |
| `argus_import_baseline` | `argus baseline-import <file>` | import an Argus JSON baseline |
| `argus_suppress_finding` | `argus suppress <id> --reason ...` | suppress a fingerprint with audit metadata |
| `argus_list_suppressions` | `argus suppressions` | inspect active/expired suppressions |
| `argus_report` | `argus report` | dedup, rank, render, export |
| `argus_reconcile` | `argus reconcile --json '<groups>'` | required explicit grouping before report |
| `argus_baseline_findings` | `argus baseline-list` | inspect canonical historical findings for identity matching |

Memory: per-target `<repo>/.argus/memory.sqlite`, plus confirmed findings promoted
to cross-target `~/.argus/global.sqlite`. Uses Node's built-in `node:sqlite` (Node 22+). Add
`.argus/` to your `.gitignore`.

SQLite runs in WAL mode with bounded busy retries, and schema migrations are
applied idempotently. Reports compare against the previous reported round and
any imported JSON baseline, classify findings as `new`, `persistent`, or
`regression`, and list previous findings not redetected (not verified fixes). Suppressions
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

### Released — v0.3.0-alpha.5

- **Shared round:** explicit MCP repository/round context and non-creating child
  attachment, tested across three separate MCP processes.

- **Challenger execution:** disclosed delegated/coordinator/unspecified modes,
  with agent-reported provenance rather than runtime-certified independence.

- **Personas:** named specialists and Challenger, with stable technical IDs.

- **Review:** four specialist lenses, adversarial Challenger, evidence packets
  and auditable claim corrections.
- **Tests:** a fifth, opt-in specialist for concrete test-reliability defects.
- **Stack:** declared JS/TS hints with package provenance and scoped optional
  React/node:test supplements; actual usage must be confirmed in code.
- **Runtime:** CLI + MCP, git diff and context, explicit reconciliation,
  ranking and Markdown/JSON/terminal reports.
- **Memory:** versioned SQLite (schema v4), canonical history, stable baseline
  identities and audited suppressions.
- **Historical coverage:** incorporated findings carry explicit links, reasons
  and covered consequences, distinct from absence or a verified fix. Original
  historical findings remain unchanged.
- **Integrations:** Claude Code, Codex, OpenCode Desktop and DSH; setup and
  diagnostics are documented in [Install](#install).

### Planned

- **0.3:** stabilize shared-round delegation and validate React/node:test across
  hosts, repeated baselines and human-adjudicated real diffs; additional stacks
  are conditional on their own evidence and controls.
- **0.4:** GitHub Action, optional PR publication and team baseline/suppression
  policies, after an explicit decision about the reasoning engine in CI.
- **0.5:** auditable repository context memory.
- **1.0:** stable contracts, maintained host matrix and expanded real-world evaluation.

See the [formal roadmap and completion gates](ROADMAP.md). Future alpha numbers
and dates are not promised; RC/stable depend on recorded validation.

### Validation limits

The [Argus Eval pilot](eval/README.md) and synthetic lab runs validate specific
workflows, not general production review quality. Agent-reported evidence is
not an execution certificate; semantic grouping still requires judgment.

Release-by-release details live in the [Changelog](CHANGELOG.md). After upgrading,
reinstall host definitions and restart the host to load the new instructions.

## License

MIT
