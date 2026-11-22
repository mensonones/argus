import type { ReviewResult } from "./result.js";
import { sameFixGroups } from "./same-fix.js";

export function renderJson(result: ReviewResult): string {
  return JSON.stringify(
    {
      base: result.baseRef,
      scope: result.scope ?? null,
      provenanceCheck: result.provenanceCheck ?? null,
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
      sameRecommendedChange: sameFixGroups(result.findings).map((group) => ({
        file: group.file,
        code: group.code,
        findingIds: group.indices.map((index) => result.findings[index].id),
      })),
      reviewerStats: result.reviewerStats,
      resolvedFindings: result.resolvedFindings,
      unmatchedPreviousCount: result.unmatchedPreviousCount,
      unmatchedPreviousFindings: result.unmatchedPreviousFindings,
      incorporatedBaselineCount: result.incorporatedBaselineCount,
      incorporatedBaselineFindings: result.incorporatedBaselineFindings,
      skippedReason: result.skippedReason,
    },
    null,
    2,
  );
}
