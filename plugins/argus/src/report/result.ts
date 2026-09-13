import type { Finding } from "../types.js";

/** Per-reviewer run accounting recorded by the runtime. */
export interface ReviewerRunStats {
  reviewer: string;
  candidates: number;
  status: "started" | "completed" | "failed" | "untracked";
  detail?: string;
}

export interface ReviewResult {
  baseRef: string;
  projectSummary: string;
  reviewersRun: string[];
  candidateCount: number;
  rejectedCount: number;
  duplicatesRemoved: number;
  suppressedCount: number;
  resolvedCount: number;
  unmatchedPreviousCount: number;
  incorporatedBaselineCount: number;
  incorporatedBaselineFindings: Array<{
    findingId: string; baselineIdentity: string; title: string; file: string;
    intoFindingId: string; reasoning: string; coveredClaims: string[];
  }>;
  unmatchedPreviousFindings: Array<Pick<Finding, "title" | "file" | "severity" | "category">>;
  /** Final, ranked, challenged findings after the severity floor. */
  findings: Finding[];
  reviewerStats: ReviewerRunStats[];
  resolvedFindings: Array<Pick<Finding, "title" | "file" | "severity" | "category">>;
  skippedReason?: string;
}
