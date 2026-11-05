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

Current version: **0.3.0-alpha.12** — [Install](#install) · [Status and roadmap](#status-and-roadmap) · [Changelog](CHANGELOG.md)

**Contents:** [Quick start](#quick-start) · [Install](#install) · [How it works](#how-it-works) ·
[Reconciliation and baseline](#reconciliation-and-baseline) · [Evidence and evaluation](#evidence-and-evaluation) ·
[Runtime](#the-runtime-mcp-tools--cli) · [Configuration](#configuration-argusyaml) ·
[Design principles](#design-principles) · [Repository layout](#repository-layout) ·
[Development](#development) · [Status and roadmap](#status-and-roadmap)

## Quick start

Argus is not a standalone bot and needs no API key of its own: your assistant
is the engine. With Claude Code and Node 22+ (24 recommended):

```bash
git clone https://github.com/mensonones/argus && cd argus
claude plugin marketplace add "$(pwd)"
claude plugin install argus@argus-marketplace
```

Then open Claude Code *inside the git repo you want reviewed* and run:

```
/argus:review
```

Other hosts (Codex, OpenCode Desktop, DeepSeek Harness) are covered in
[Install](#install).

## Install

This repo is a plugin **marketplace**. Whatever the host, the deterministic
runtime (the MCP server + `argus` CLI) runs from a compiled `dist/`.

**Prerequisite (all hosts): Node 22 or newer.** Development and CI use Node 24
(see [`.nvmrc`](.nvmrc)).

`plugins/argus/dist/` is committed, so installing from GitHub needs no build. Build
only after changing the TypeScript under `plugins/argus/src/`:

```bash
npm run build   # installs deps + builds plugins/argus
```

> Every host reviews the repo the assistant is open in, and writes memory to
> `<repo>/.argus/`. Add `.argus/` to that repo's `.gitignore`.

**Upgrading:** after pulling a new version, reinstall your host definitions and
start a fresh session so the updated instructions load. The
[Changelog](CHANGELOG.md) says when a release is instruction-only.

### Claude Code

**Install** with the `claude` CLI (from any terminal):

```bash
# from a local checkout:
claude plugin marketplace add /absolute/path/to/argus
# …or from GitHub:
claude plugin marketplace add mensonones/argus

claude plugin install argus@argus-marketplace
```

Or interactively inside Claude Code: `/plugin marketplace add <path-or-owner/repo>`
then `/plugin install argus@argus-marketplace`.

**Activate:** run `/reload-plugins` in a running session (MCP servers take effect
in the *next* session — restart Claude Code if `/mcp` doesn't list `argus` yet).

**Verify:** `/mcp` shows `argus` connected; `/argus` suggests `/argus:review`.

Claude specialist agents preload the matching review skill and deny `Write` and
`Edit` at the agent configuration layer. They inspect and report; they do not
modify the reviewed files.

**Start** — open Claude Code *inside the git repo you want reviewed* and run:

```
/argus:review
/argus:review --base main
/argus:review src/payment/ security only
```

### Codex

**Install** from the Codex marketplace contained in this repository:

```bash
codex plugin marketplace add /absolute/path/to/argus
codex plugin add argus@argus-marketplace
```

The Codex marketplace manifest lives at `.agents/plugins/marketplace.json`.
The plugin uses the portable Agent Plugins layout: `plugins/argus/plugin.json`
for package identity and OpenAI interface metadata, `plugins/argus/mcp.json`
for the bundled MCP server, and `plugins/argus/skills/` for skills. The legacy
`.codex-plugin/plugin.json` + `.mcp.json` pair remains packaged as a compatibility
overlay for hosts that have not adopted the portable layout.

**Custom agents.** Install the reviewer/challenger personas as Codex custom
agents (TOML) in your personal `~/.codex/agents/`, then verify:

```bash
npm run install:codex     # writes ~/.codex/agents/argus-*.toml
npm run doctor:codex      # verifies the files and plugin registration
```

> **Named dispatch is host-limited.** Codex custom agents follow the
> [subagents spec](https://learn.chatgpt.com/docs/agent-configuration/subagents)
> (`name`, `description`, `developer_instructions`, `model_reasoning_effort`,
> `sandbox_mode`). You can invoke them **by name in interactive Codex**. But in a
> **tool-backed session**, `spawn_agent` cannot select a custom agent by name
> ([openai/codex#15250](https://github.com/openai/codex/issues/15250)); the Argus
> coordinator uses the documented workaround — it reads each agent's
> `developer_instructions` and injects them into a generic worker, and discloses
> the run as a generic worker with injected instructions, never a host-loaded
> role. A persona name in the prompt is not a loaded role.

As an MCP-only fallback, register the runtime in `~/.codex/config.toml`:

```toml
[mcp_servers.argus]
command = "node"
args = ["/absolute/path/to/argus/plugins/argus/scripts/argus-mcp.cjs"]
```

**Start** — from within a git repo, invoke a reviewer by name in interactive
Codex (`@argus-correctness`, `@argus-security`, …) or ask Codex to *"run an Argus
review of the current change"*. Findings are recorded through the `argus_*` MCP
tools; the report comes from `argus_report`.

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

## How it works

Argus coordinates a review; your assistant does the reasoning. It provides:

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

### Personas

The named personas below appear in delegation instructions and readable
reports; runtime IDs remain unchanged.

| Persona | Role | Technical agent ID |
| --- | --- | --- |
| Atena | Correctness | `argus-correctness` |
| Cerbero | Security | `argus-security` |
| Hermes | Performance | `argus-performance` |
| Dedalo | Architecture | `argus-architecture` |
| Temis | Tests (opt-in) | `argus-tests` |
| Momo | Challenger | `argus-challenger` |

`argus_init.personas` exposes the display catalog, independently of enabled
lenses. JSON/SQLite keep technical reviewer IDs. A host can still assign an
instance a different name, such as Cicero; Argus does not control that label.
A persona name alone is not evidence that its agent instructions were loaded.

The Tests reviewer is opt-in (`reviewers: { tests: true }` in
[`argus.yaml`](#configuration-argusyaml)). The coordinator selects it for
changed tests/setup or concrete reliability concerns. It checks assertions,
async failure observation, mocks and isolation; missing coverage alone is not a
finding. Its candidates still require Challenger validation and reconciliation.

### Challenger provenance

Instructions require real Challenger delegation when the host supports it, and
explicit disclosure of any coordinator fallback. Verdict execution metadata
records a host child ID or fallback reason; readable reports disclose
unspecified legacy execution. These are agent-reported records, not
host-certified independence.

```bash
argus challenge <id> CONFIRMED --reason "..." --execution \
  '{"mode":"coordinator","detail":"Host delegation unavailable; validation instructions loaded"}'
```

### Review scope

Default `mode: auto` selects staged/unstaged/untracked reviewable changes if
present within the requested paths and `argus.yaml` ignores. Otherwise it reviews
the branch's non-merge commits absent from the pinned base tip. Argus artifacts
and documentation-only local changes do not trigger a local code review.

Explicit mode wins: “only commits, no merges” means `branch-commits`, ignoring
local edits. Each selected SHA is compared to its own parent; merge-only
resolution edits are excluded. Init and attachment return `patchSets` with
SHA/parent boundaries. Local patches preserve staged and unstaged separately,
including opposing edits. Empty selection means there is no change to review.

CLI: `argus init --mode branch-commits --base main`; MCP:
`argus_init({repo_path: "/absolute/repo", mode: "branch-commits", base: "main"})`.
Other modes: `working-tree`, `integrated-branch-diff`, or a single `commit`.
`--committed-only` selects branch commits unless integrated mode is explicit.

Branch findings require `source_commits` from selected patches touching the
file. Reviewers inspect those trees; the Challenger checks continued relevance
at pinned HEAD. A later-reverted historical defect is not a current actionable
finding. Reports record the selected SHAs and scope independently of baseline
history (`new`/`persistent`). Patch attribution does not certify causal truth.

### Pre-report safeguards

Delegated verdicts require report `provenance` with the real `coordinator_id`
and `dispatched_challenger_ids` returned by the host. Missing/mismatched IDs
block closure. Send returned child IDs explicitly; `CODEX_SESSION_ID` may identify
the parent. This compares coordinator-supplied records, not certified host execution.

```bash
argus report --provenance '{"coordinator_id":"parent-id","dispatched_challenger_ids":["child-id"]}'
```

Init/attachment/reports expose `scope`: pinned base/head revisions, paths,
working-tree inclusion and merge policy. Explicit integrated mode is an endpoint diff;
enumerating non-merge commits does not exclude merge-resolution changes.
Single-commit mode rejects merge/root commits without a supported comparison.
Issues already present at the pinned base must be disclosed as pre-existing;
baseline NEW is not proof of introduction by this change. Legacy scope is unspecified.

New merged reconciliation groups require `causal_analysis` and `claim_coverage`
linking current member claims to exact canonical description/evidence/impact
excerpts (and packet observations when present). This prevents grouping prose
from standing in for canonical content. Excerpt presence does not prove semantic
equivalence or complete claim preservation; those still require adjudication.
Historical groups remain readable without retroactive certification.

Report generation also blocks reviewers still in `started` state; record their
completion or failure first.

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

`argus_init` refuses to replace an active round. The only way to unblock a new
one is `argus_abandon_round`, which ends the active round explicitly with an
audited reason.

## Reconciliation and baseline

**Required reconciliation.** Reconciliation is mandatory before reporting. Each
group supplies `canonical_id`, `members` (`finding_id`, reviewed `category`),
`rootCause`, `reasoning` and `claims_reviewed: true`. Every surviving ID must occur
once; use `[]` when none survive. The coordinator reviews semantics and corrects
canonical claims first; the runtime checks coverage, retains provenance and
blocks stale plans after any finding/verdict/correction change. It does not
certify semantic equivalence or union duplicate prose. Missing or invalid finding
categories fail.

**Baseline identity.** `argus_baseline_findings` / `argus baseline-list` exposes
previous, historical and imported findings, and preserves canonical groups across
rounds. Reconciliation can include `baseline_match` with a historical `finding_id`
and semantic-equivalence `reasoning` to preserve `baselineIdentity` despite changed
wording/category. The runtime checks existing IDs, same file and one identity per
current defect; semantic truth remains the coordinator's job. Distinct validated
root causes do not automatically match by title or line. Reported history includes
filtered/suppressed canonical findings, not raw duplicates.

Query it compactly: `argus baseline-list --file src/accounts.js --limit 20`.
Follow `nextOffset` using `--offset`; retrieve evidence with `--finding-id <id>`.

**Disputed splits.** Compare causal preconditions, contracts and observable
consequences, using targeted controls when practical. Challenger votes,
invariant names and examples are not evidence of independence. One root cause
may have several consequences in one finding. `NEW` means newly identified
against history, not newly introduced in code. The
[DSH lab note](eval/observations/2026-09-12-dsh-lab.md) remains unscored and
records the subsequent maintainer-approved grouping; it does not establish a
fourth ground-truth defect or a scored model evaluation.

**Incorporated history.** Reconciliation accepts `incorporated_baselines` entries
with historical `finding_id`, `reasoning` and nonempty `covered_claims`. Use them
when a verified consequence formerly reported separately is preserved in current
canonical content, not when it was fixed or discarded. Reports expose
`incorporatedBaselineCount` and `incorporatedBaselineFindings`, with destination
IDs, without marking that history not-redetected. Coverage must be verified
each round; the runtime checks references/conflicts, not semantic completeness.
Reconciliation also confirms the historical links actually applied to each group.

**Not redetected, not resolved.** Historical findings absent from a later review
are labeled **not redetected**: absence or a changed fingerprint is not proof of
a fix. JSON exposes `unmatchedPreviousCount` and `unmatchedPreviousFindings`;
legacy `resolvedCount` and `resolvedFindings` remain zero/empty until fix
verification is supported.

## Evidence and evaluation

### Stack detection

`argus_init.stack` exposes declared framework, test-runner and package-manager
hints from the root and affected JS/TS package manifests. Each signal names its
source file and field; these are not verified runtime usage. Inspection is
limited to 64 affected directories and 1 MiB per manifest, with
warnings/truncation disclosed. Sibling packages and dependency trees are not
scanned. Broader ecosystem detection remains planned.

The first stack supplements are `react-review` (state/effects)
and `node-test-review` (Node runner assertion observation and isolation).
`argus_init.stackSkills` suggests them for the nearest inspected package and
enabled lenses only. Confirm actual code/runner usage before loading; a manifest
declaration is not enough. They preserve the specialist category and Challenger
workflow, and do not enable reviewers. Live React review quality remains
unvalidated. The [Codex Tests Reviewer lab observation](eval/observations/2026-09-17-codex-tests-lab.md)
validates one synthetic workflow, not general review quality.

### Evidence packets and root causes

Findings and Challenger verdicts optionally carry an `evidencePackage` v1:
revision, working-tree state, validation method, execution path, preconditions,
expected/observed behavior, limitations and optional negative control. Executed
methods require a command and recorded output/artifact. These are agent-reported
observations, not execution certificates. Legacy findings remain supported.
The ranking does not reward evidence text volume or reviewer agreement.

Challenger-validated `rootCause` triples describe symbol, mechanism and violated
invariant. Current-round consolidation requires explicit reconciliation, based
on causal evidence rather than invariant labels or line proximity. Legacy
title/location heuristics remain only for historical matching.

The Challenger can submit a `correction` with revised claim-bearing content,
a reason and a replacement evidence packet. Original content stays in the
SQLite/JSON audit history; reports show corrected claims and correction reasons.
Correcting an exaggeration is different from rejecting a real defect or
suppressing a finding.

### Evaluation

`npm run eval:prepare` emits label-free pilot tasks for your existing assistant.
`npm run eval:score -- /absolute/path/run.json` scores human-adjudicated runs.
See [Argus Eval](eval/README.md) for configurations, format and limitations.
The eight-case synthetic pilot tests the evaluation workflow; it does **not**
establish production review quality. No model API or API key is introduced.

## The runtime (MCP tools / CLI)

The deterministic pipeline is exposed both as MCP tools (preferred) and a CLI
fallback:

| MCP tool | CLI | Purpose |
|---|---|---|
| `argus_init` | `argus init` | detect repo, committed + working-tree diff, context, open a round |
| `argus_abandon_round` | — | end the active round explicitly, with an audited reason |
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
to cross-target `~/.argus/global.sqlite`. Uses Node's built-in `node:sqlite`
(Node 22+).

SQLite runs in WAL mode with bounded busy retries, and schema migrations are
applied idempotently. Reports compare against the previous reported round and
any imported JSON baseline, classify findings as `new`, `persistent`, or
`regression`, and list previous findings not redetected (not verified fixes).
Suppressions require a reason, can expire, and are retained for audit.

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
.github/workflows/ci.yml            # CI: Linux, Windows and macOS
.nvmrc                              # Node version for development and CI
plugins/argus/
  plugin.json                        # portable Agent Plugins manifest
  mcp.json                           # portable MCP declaration
  .claude-plugin/plugin.json         # Claude Code plugin
  .codex-plugin/plugin.json          # Codex compatibility overlay
  .mcp.json                          # compatibility MCP registration
  agents/                            # reviewer + challenger subagents
  commands/review.md                 # /argus:review coordinator
  skills/                            # methodology + heuristics + gates
  templates/                         # finding + report templates
  scripts/argus-mcp.cjs              # MCP launcher
  scripts/gen-hosts.mjs              # regenerates Codex/OpenCode/DSH from canon
  scripts/install-dsh.mjs            # DSH installer
  scripts/doctor-dsh.mjs             # DSH diagnostics
  src/                               # TypeScript runtime (MCP + CLI + SQLite)
  dist/                              # compiled runtime (committed on purpose)
  tests/                             # node:test suite
plugins/argus-dsh/                   # DSH profile bundle (@argus/dsh-plugin)
  cordis.patch.yml                   # generated specialist subagent tools
  skills/                            # generated DSH-shaped skills
.codex/agents/                       # generated Codex mirror
.opencode/                           # generated OpenCode mirror
eval/                                # Argus Eval corpus and scoring
opencode.json
```

The Codex, OpenCode, and DSH artifacts are **generated** from the canonical
Claude Code plugin — run `npm run gen-hosts` after editing an agent, skill, or
command.

## Development

Use Node 24 (the version in [`.nvmrc`](.nvmrc); `nvm use` / `fnm use` pick it up).
The runtime supports Node 22 and newer.

```bash
npm run build           # install deps and compile plugins/argus
npm test                # build, then run the node:test suite
npm run typecheck       # tsc --noEmit
npm run release:validate  # tests + pack, install the package and handshake MCP
npm run gen-hosts       # regenerate the Codex/OpenCode/DSH mirrors
```

- **`dist/` is committed on purpose** so the plugin runs from a GitHub install
  with no build step. After changing `src/`, rebuild and commit `dist/` in the
  same change; CI fails if the committed `dist/` differs from a fresh build.
- **Line endings:** `.gitattributes` keeps `dist/` and the agent definitions in
  LF, so rebuilding on Windows does not show spurious diffs.
- **Platforms:** CI runs the suite on Linux, Windows and macOS. A test that
  needs symlinks skips itself on hosts that do not permit them (for example
  Windows without Developer Mode).
- **Dependencies:** CI also runs `npm audit --audit-level=high` and fails on a
  new high or critical advisory.

## Status and roadmap

**Current release: 0.3.0-alpha.12.** Four specialist lenses plus an opt-in Tests
reviewer, an adversarial Challenger with evidence packets and auditable
corrections, explicit reconciliation, versioned SQLite memory (schema v4) with
canonical history and audited suppressions, and integrations for Claude Code,
Codex, OpenCode Desktop and DSH. Release-by-release details live in the
[Changelog](CHANGELOG.md).

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

## License

MIT — see [LICENSE](LICENSE).
