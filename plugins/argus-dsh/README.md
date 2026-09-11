# Argus for the DeepSeek Harness (DSH)

This directory is the **DSH profile bundle** for Argus. DSH has no marketplace and
no Markdown agents or commands, so Argus is packaged the DSH way: a bundle is an
npm package whose `dsh.bundle.patch` names a loader patch, and a profile that
lists the package in `dsh.profile.bundles` applies it as one more patch layer.

`cordis.patch.yml` is **generated** from the canonical plugin — edit
`plugins/argus/agents/*.md`, then run `npm run gen-hosts`.

## What the bundle provides

One model-facing delegation tool per Argus specialist — the DSH replacement for
the named subagents of the other hosts:

| Tool | Persona | Role |
|---|---|---|
| `argus_correctness` | `argus-correctness` | logic, state, concurrency, edge-case bugs |
| `argus_security` | `argus-security` | injection, auth, secrets, crypto, IO |
| `argus_performance` | `argus-performance` | queries, loops, network, hot paths |
| `argus_architecture` | `argus-architecture` | boundaries, coupling, responsibilities |
| `argus_challenger` | `argus-challenger` | adversarial validation of each finding |

Each tool starts a child on the in-process `spawn` backend with that reviewer's
persona. The child joins the caller's composition, so it also sees the Argus MCP
tools and the Argus skills. `maxDepth: 1` lets the coordinator (depth 0) start a
reviewer (depth 1) while stopping that reviewer from delegating further, and
background calls stay enabled so independent lenses can run in parallel.

## What the bundle deliberately does not provide

Two pieces are machine-specific and are written by `scripts/install-dsh.mjs`
instead:

- **The MCP server row.** A profile patch cannot resolve a path relative to its
  own package, so the absolute launcher path (`node` + `dist/bin/argus-mcp.js`)
  goes into the user's patch layer, `$DSH_HOME/cordis.patch.yml`. It registers
  the server as `argus`, so its tools appear as `mcp__argus__<tool>`.
- **The skills.** They are copied to the user skill root, `$DSH_HOME/skills`,
  which `dsh-skill-filesystem` scans on every surface — the Web GUI's `standard`
  preset included.

## Install

From the Argus repository root:

```bash
npm run install:dsh              # build + generate + install into the web profile
npm run doctor:dsh               # verify artifacts, patch, and a real MCP handshake
```

Useful flags (passed through to the installer):

```bash
node plugins/argus/scripts/install-dsh.mjs --profile web   # target profile (default: web)
node plugins/argus/scripts/install-dsh.mjs --dry-run       # show what would change
node plugins/argus/scripts/install-dsh.mjs --skip-bundle   # skills + MCP only
node plugins/argus/scripts/install-dsh.mjs --dsh-home DIR  # non-default $DSH_HOME
```

## Using it

Restart the DSH surface so the patch applies, open a Git repository, and run
`/argus-review` — or just ask for an Argus review. DSH skill names must be
kebab-case, so this is the host-local form of Claude Code's `/argus:review`: the
coordinator skill's DSH copy is named `argus-review` while the canonical skill
stays `full-review` for the other hosts. The lens skills keep their canonical
names and are slash-invocable too (`/correctness-review`, `/security-review`,
`/performance-review`, `/architecture-review`, `/challenger-validation`).

The coordinator calls `mcp__argus__argus_init` with the workspace root, dispatches
the reviewer tools for the lenses that matter, has `argus_challenger` refute every
candidate, and renders the ranked report with `mcp__argus__argus_report`. Memory
stays in `<repo>/.argus/`; add it to that repository's `.gitignore`.

The installer also prunes rename leftovers: a skill directory it previously wrote
(or any canonical Argus skill) that is no longer part of the bundle is removed, so
the `/` menu never keeps a stale entry.

## Manual registration

The installer runs this for you; to do it by hand:

```bash
dsh plugin --profile web add /absolute/path/to/argus/plugins/argus-dsh
```

`dsh plugin` forwards to pnpm in the profile directory and then reconciles
`dsh.profile.bundles`, so a dependency that declares `dsh.bundle` joins the layer
stack automatically.
