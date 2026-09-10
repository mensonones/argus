# Argus Review

{one-line project + base summary}

- {N} reviewer(s): {list}
- {C} candidate finding(s)
- {R} rejected by Challenger
- {D} duplicate(s) merged
- **{K} finding(s)**

---

### {n}. {SEVERITY} · {category} — {title}

**Location:** `{file}:{start}-{end}`

{description}

**Evidence**

- {evidence 1}
- {evidence 2}

**Scenario**

{scenario}

**Impact**

{impact}

**Confidence:** {CONFIDENCE}

**Recommendation**

{recommendation}

_Detected by: {reviewer(s)} · Challenger: {CONFIRMED|PLAUSIBLE}_

---

<!--
Discipline:
- Lead with the highest-ranked findings.
- Write for the developer. Do not narrate the review process, `.argus/`, subagents, or memory.
- No style nits. Every finding cites real code and a concrete impact.
- If nothing survived, say the change looks clean.
-->
