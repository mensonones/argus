import type { Finding, Severity } from "../types.js";
import type { ReviewResult } from "./result.js";
import { personaLabel, PERSONAS } from "../personas.js";
import { challengeExecutionLabel } from "./challenge.js";

const SEVERITY_LABEL: Record<Severity, string> = {
  info: "INFO",
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};

function location(f: Finding): string {
  if (!f.lines) return f.file;
  const { start, end } = f.lines;
  return end && end !== start ? `${f.file}:${start}-${end}` : `${f.file}:${start}`;
}

function renderFinding(f: Finding, index: number): string {
  const lines: string[] = [];
  lines.push(
    `### ${index}. ${SEVERITY_LABEL[f.severity]} · ${f.category} — ${f.title}`,
  );
  lines.push("");
  lines.push(`**Location:** \`${location(f)}\``);
  lines.push("");
  if (f.description) {
    lines.push(f.description);
    lines.push("");
  }
  if (f.evidence.length) {
    lines.push("**Evidence**");
    lines.push("");
    for (const e of f.evidence) lines.push(`- ${e}`);
    lines.push("");
  }
  if (f.scenario) {
    lines.push("**Scenario**");
    lines.push("");
    lines.push(f.scenario);
    lines.push("");
  }
  if (f.impact) {
    lines.push("**Impact**");
    lines.push("");
    lines.push(f.impact);
    lines.push("");
  }
  lines.push(`**Confidence:** ${f.confidence.toUpperCase()}`);
  if (f.rootCause) lines.push(`**Root cause:** ${f.rootCause.symbol} · ${f.rootCause.mechanism} · ${f.rootCause.invariant}`);
  if (f.corrections?.length) {
    lines.push("", "**Challenger corrections**", "");
    for (const correction of f.corrections) lines.push(`- ${correction.reason}`);
    lines.push("");
  }
  const packet = f.evidencePackage;
  lines.push(`**Validation:** ${packet?.method ?? "legacy / unspecified"} (reviewer-reported)`);
  if (packet) {
    lines.push(`**Snapshot:** ${packet.revision} · working tree: ${packet.workingTree}`);
    lines.push("");
    lines.push("**Validation observations**", "");
    lines.push(`- Path: ${packet.executionPath.join(" → ")}`);
    for (const item of packet.preconditions) lines.push(`- Precondition: ${item}`);
    lines.push(`- Expected: ${packet.expected}`, `- Observed: ${packet.observed}`);
    if (packet.command) lines.push(`- Command (not executed by Argus): ${packet.command}`);
    if (packet.artifact) lines.push(`- Recorded result/artifact: ${packet.artifact}`);
    if (packet.negativeControl) lines.push(`- Negative control: ${packet.negativeControl.scenario} — ${packet.negativeControl.observed}`);
    for (const item of packet.limitations) lines.push(`- Limitation: ${item}`);
  }
  if (f.baselineStatus) lines.push(`**Baseline:** ${f.baselineStatus.toUpperCase()}`);
  if (f.baselineIdentity) lines.push(`**Baseline identity:** ${f.baselineIdentity}`);
  if (f.baselineMatch) lines.push(`**Historical match:** ${f.baselineMatch.findingId} — ${f.baselineMatch.reasoning}`);
  for (const link of f.baselineIncorporations ?? []) {
    lines.push(`**Incorporated historical finding:** ${link.findingId} (identity ${link.baselineIdentity}) — ${link.reasoning}`);
    for (const claim of link.coveredClaims) lines.push(`- Covered consequence: ${claim}`);
  }
  if (f.consolidation) lines.push(`**Reconciliation:** canonical ${f.consolidation.canonicalId}; members ${f.consolidation.memberIds.join(", ")} — ${f.consolidation.reasoning}`);
  if (f.categories?.length) lines.push(`**Lenses:** ${f.categories.join(", ")}`);
  lines.push("");
  if (f.recommendation) {
    lines.push("**Recommendation**");
    lines.push("");
    lines.push(f.recommendation);
    lines.push("");
  }
  const detected = f.detectedBy && f.detectedBy.length > 1
    ? f.detectedBy.map(personaLabel).join(", ")
    : personaLabel(f.reviewer);
  const challenge = f.challenge
    ? ` · Challenger: ${PERSONAS.challenger.name} — ${f.challenge.result} · ${challengeExecutionLabel(f.challenge)}`
    : "";
  lines.push(`_Detected by: ${detected}${challenge}_`);
  return lines.join("\n");
}

export function renderMarkdown(result: ReviewResult): string {
  const out: string[] = [];
  out.push("# Argus Review");
  out.push("");
  out.push(result.projectSummary);
  out.push("");
  out.push(`- Base: \`${result.baseRef}\``);
  out.push(
    `- ${result.reviewersRun.length} reviewer(s): ${result.reviewersRun.map(personaLabel).join(", ") || "none"}`,
  );
  out.push(`- ${result.candidateCount} candidate finding(s)`);
  out.push(`- ${result.rejectedCount} rejected by Challenger`);
  if (result.duplicatesRemoved > 0) {
    out.push(`- ${result.duplicatesRemoved} duplicate(s) removed`);
  }
  if (result.suppressedCount > 0) out.push(`- ${result.suppressedCount} suppressed finding(s)`);
  if (result.unmatchedPreviousCount > 0) out.push(`- ${result.unmatchedPreviousCount} previous findings not redetected (not verified as fixed)`);
  if (result.incorporatedBaselineCount > 0) out.push(`- ${result.incorporatedBaselineCount} historical findings incorporated into current findings (not fixed)`);
  out.push(`- **${result.findings.length} finding(s)**`);
  out.push("");

  if (result.skippedReason) {
    out.push(`> ${result.skippedReason}`);
    out.push("");
  }

  if (result.findings.length === 0) {
    out.push("No findings. ✅");
  } else {
    out.push("---");
    out.push("");
    result.findings.forEach((f, i) => {
      out.push(renderFinding(f, i + 1));
      out.push("");
      out.push("---");
      out.push("");
    });
  }

  if (result.incorporatedBaselineFindings.length > 0) {
    out.push("## Historical findings incorporated — not fixed", "");
    for (const finding of result.incorporatedBaselineFindings) {
      out.push(`- ${finding.file} — ${finding.title} (${finding.findingId}) → ${finding.intoFindingId}: ${finding.reasoning}`);
    }
    out.push("");
  }

  if (result.unmatchedPreviousFindings.length > 0) {
    out.push("## Previous findings not redetected — not verified as fixed");
    out.push("");
    for (const finding of result.unmatchedPreviousFindings) {
      out.push(`- ${finding.severity.toUpperCase()} · ${finding.file} — ${finding.title}`);
    }
    out.push("");
  }

  out.push(`_Generated by Argus._`);
  return out.join("\n");
}
