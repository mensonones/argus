import { color } from "../logger.js";
function severityTag(sev) {
    const label = sev.toUpperCase().padEnd(8);
    switch (sev) {
        case "critical":
            return color.bold(color.red(label));
        case "high":
            return color.red(label);
        case "medium":
            return color.yellow(label);
        case "low":
            return color.blue(label);
        default:
            return color.gray(label);
    }
}
function location(f) {
    if (!f.lines)
        return f.file;
    const { start, end } = f.lines;
    return end && end !== start ? `${f.file}:${start}-${end}` : `${f.file}:${start}`;
}
function block(title, body) {
    return `${color.bold(title)}\n\n${body}\n`;
}
export function renderTerminal(result) {
    const out = [];
    out.push(color.bold(color.cyan("\nArgus Review")));
    out.push(color.dim(result.projectSummary.split("\n")[0]));
    out.push("");
    out.push(`${result.reviewersRun.length} reviewers executed` +
        color.dim(`  (${result.reviewersRun.join(", ") || "none"})`));
    out.push(`${result.candidateCount} candidate findings`);
    out.push(`${result.rejectedCount} rejected by Challenger`);
    if (result.duplicatesRemoved > 0) {
        out.push(`${result.duplicatesRemoved} duplicate removed`);
    }
    if (result.suppressedCount > 0)
        out.push(`${result.suppressedCount} suppressed`);
    if (result.unmatchedPreviousCount > 0)
        out.push(`${result.unmatchedPreviousCount} previous findings not redetected (not verified as fixed)`);
    out.push("");
    out.push(color.bold(`${result.findings.length} findings`));
    if (result.skippedReason) {
        out.push("");
        out.push(color.yellow(result.skippedReason));
    }
    for (const f of result.findings) {
        out.push("");
        out.push(color.gray("─".repeat(64)));
        out.push("");
        out.push(`${severityTag(f.severity)} ${color.dim("·")} ${f.category}`);
        out.push(color.cyan(location(f)));
        out.push("");
        out.push(color.bold(f.title));
        if (f.description) {
            out.push("");
            out.push(f.description);
        }
        if (f.evidence.length) {
            out.push("");
            out.push(block("Evidence", f.evidence.map((e) => `  ${e}`).join("\n")));
        }
        if (f.scenario) {
            out.push(block("Scenario", f.scenario));
        }
        if (f.impact) {
            out.push(block("Impact", f.impact));
        }
        out.push(block("Confidence", `  ${f.confidence.toUpperCase()}`));
        if (f.rootCause)
            out.push(block("Root cause", `${f.rootCause.symbol} · ${f.rootCause.mechanism} · ${f.rootCause.invariant}`));
        if (f.consolidation)
            out.push(block("Reconciliation", `Canonical: ${f.consolidation.canonicalId}\nMembers: ${f.consolidation.memberIds.join(", ")}\n${f.consolidation.reasoning}`));
        if (f.categories?.length)
            out.push(block("Lenses", f.categories.join(", ")));
        if (f.corrections?.length)
            out.push(block("Challenger corrections", f.corrections.map(c => c.reason).join("\n")));
        const packet = f.evidencePackage;
        out.push(block("Validation", `  ${packet?.method ?? "legacy / unspecified"} (reviewer-reported)`));
        if (packet) {
            out.push(block("Snapshot", `  ${packet.revision} · working tree: ${packet.workingTree}`));
            out.push(block("Observations", `Expected: ${packet.expected}\nObserved: ${packet.observed}`));
            if (packet.negativeControl)
                out.push(block("Negative control", `${packet.negativeControl.scenario}: ${packet.negativeControl.observed}`));
            if (packet.limitations.length)
                out.push(block("Limitations", packet.limitations.join("\n")));
        }
        if (f.baselineStatus)
            out.push(block("Baseline", `  ${f.baselineStatus.toUpperCase()}`));
        if (f.baselineIdentity)
            out.push(block("Baseline identity", f.baselineIdentity));
        if (f.baselineMatch)
            out.push(block("Historical match", `${f.baselineMatch.findingId}: ${f.baselineMatch.reasoning}`));
        for (const link of f.baselineIncorporations ?? [])
            out.push(block("Incorporated historical finding (not fixed)", `${link.findingId} (identity ${link.baselineIdentity}): ${link.reasoning}\nCovered: ${link.coveredClaims.join("; ")}`));
        if (f.recommendation) {
            out.push(block("Recommendation", f.recommendation));
        }
        const detected = f.detectedBy && f.detectedBy.length > 1
            ? f.detectedBy.join(", ")
            : f.reviewer;
        out.push(color.dim(`detected by ${detected}` +
            (f.challenge ? ` · challenger: ${f.challenge.result}` : "")));
    }
    if (result.incorporatedBaselineFindings.length > 0) {
        out.push("", color.bold("Historical findings incorporated — not fixed"));
        for (const finding of result.incorporatedBaselineFindings)
            out.push(`  ${finding.file} — ${finding.title} (${finding.findingId}) → ${finding.intoFindingId}: ${finding.reasoning}`);
    }
    if (result.unmatchedPreviousFindings.length > 0) {
        out.push("");
        out.push(color.bold("Previous findings not redetected — not verified as fixed"));
        for (const finding of result.unmatchedPreviousFindings) {
            out.push(`  ${finding.severity.toUpperCase()} · ${finding.file} — ${finding.title}`);
        }
    }
    out.push("");
    return out.join("\n");
}
