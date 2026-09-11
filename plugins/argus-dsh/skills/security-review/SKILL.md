---
name: security-review
description: Heuristics and a checklist for the Argus Security Reviewer — taint tracing, and detection patterns for auth/authz, injection, IDOR/BOLA, SSRF, path traversal, deserialization, secrets, crypto misuse, and unsafe IO. Load when reviewing changed code for security, or when acting as argus_security.
---

# Security Review Heuristics

> **DSH host.** This skill runs on the DeepSeek Harness. Argus is reached
> through MCP, so every Argus tool is namespaced `mcp__argus__<tool>`
> (for example `mcp__argus__argus_init`). The specialist reviewers and
> the adversary are model-facing tools that carry their own reviewer persona:
> `argus_architecture`, `argus_challenger`, `argus_correctness`, `argus_performance`, `argus_security`. Call them as tools —
> they replace the named subagents of the other hosts and inherit the Argus
> skills and MCP tools.

Conservative by design. Report only findings with a concrete, realistic exploit
path. When unsure, drop it or mark low confidence for the Challenger.

## Method: taint tracing

Start at dangerous **sinks** and trace input **backward** to an entry point.
- Sinks: DB query builders, `exec`/`spawn`, template renderers,
  `dangerouslySetInnerHTML`, `eval`, deserializers, file paths, outbound URLs,
  redirects, reflection.
- Sources: HTTP params/body/headers, query strings, uploaded files, webhook
  payloads, message queues, env-influenced-by-user, third-party responses.
- A finding needs an **unbroken path** source → sink with no adequate
  sanitization/validation in between.

## Class checklist

- **Injection.** Concatenated SQL/NoSQL/OS command/LDAP/template. Confirm it is
  not parameterized or auto-escaped. `grep` for string-built queries.
- **AuthN.** Missing/again-optional authentication; weak session handling;
  token/secret in code or logs; JWT `alg:none` or unverified signatures.
- **AuthZ / IDOR / BOLA.** Object accessed by user-supplied id without an
  ownership/tenant check. Map actor → operation → object; look for the missing
  guard on the changed path.
- **SSRF.** User-controlled URL passed to a server-side fetch without an allowlist.
- **Path traversal.** User input in a filesystem path without normalization/
  containment (`../`).
- **Deserialization.** Untrusted data into an unsafe deserializer.
- **Secrets.** Hardcoded keys/tokens/passwords; secrets logged or returned.
- **Crypto misuse.** ECB, static IV/nonce, weak hash for passwords, `Math.random`
  for tokens, missing constant-time compare.
- **Sensitive data exposure.** PII/secret returned in a response or error.

## Before recording

Ask the Challenger's questions of yourself first: is the input external and
attacker-controlled? Is there upstream validation? Is the vulnerable config a
documented default rather than a forced setup? If a protection already stops the
exploit, do not record it. Record with `mcp__argus__argus_record_finding` (`reviewer:
security`), citing the exact taint path in `evidence`.
