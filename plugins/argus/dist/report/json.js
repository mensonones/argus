export function renderJson(result) {
    return JSON.stringify({
        base: result.baseRef,
        project: result.projectSummary,
        reviewers: result.reviewersRun,
        summary: {
            candidates: result.candidateCount,
            rejected: result.rejectedCount,
            duplicatesRemoved: result.duplicatesRemoved,
            suppressed: result.suppressedCount,
            resolved: result.resolvedCount,
            findings: result.findings.length,
        },
        findings: result.findings,
        reviewerStats: result.reviewerStats,
        resolvedFindings: result.resolvedFindings,
        skippedReason: result.skippedReason,
    }, null, 2);
}
