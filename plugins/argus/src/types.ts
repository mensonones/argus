/**
 * Core domain types for Argus.
 *
 * These mirror the Finding structure described in the design document
 * (section 13) with a few additions needed by the deduplicator/ranker.
 */

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type Confidence = "low" | "medium" | "high";

export type Category =
  | "correctness"
  | "security"
  | "performance"
  | "architecture"
  | "tests";

export type FindingStatus = "candidate" | "confirmed" | "rejected";

export type BaselineStatus = "new" | "persistent" | "regression";

export type ChallengeResult = "CONFIRMED" | "PLAUSIBLE" | "REJECTED";

export interface LineRange {
  start: number;
  end: number;
}

export interface Challenge {
  result: ChallengeResult;
  reasoning: string;
}

/** Recorded observations, not an execution certificate issued by Argus. */
export interface EvidencePackage {
  schemaVersion: 1;
  revision: string;
  workingTree: "clean" | "dirty" | "unknown";
  method: "static-analysis" | "test" | "reproduction";
  executionPath: string[];
  preconditions: string[];
  expected: string;
  observed: string;
  limitations: string[];
  command?: string;
  artifact?: string;
  negativeControl?: { scenario: string; observed: string };
}

export interface Finding {
  id: string;
  title: string;
  category: Category;
  /** All lenses associated with a consolidated finding. */
  categories?: Category[];
  severity: Severity;
  confidence: Confidence;
  file: string;
  lines?: LineRange;
  description: string;
  evidence: string[];
  evidencePackage?: EvidencePackage;
  impact: string;
  scenario?: string;
  recommendation?: string;
  /** Which reviewer(s) produced this finding. */
  reviewer: string;
  status: FindingStatus;
  challenge?: Challenge;

  /**
   * Populated by the deduplicator when several reviewers report the same
   * problem. Reviewer provenance does not establish statistical independence.
   */
  detectedBy?: string[];
  /** Ranking score assigned by the ranker. Higher = shown first. */
  score?: number;
  /** Relationship to the imported or previous-review baseline. */
  baselineStatus?: BaselineStatus;
}

/** A finding before it has been challenged (status is always "candidate"). */
export type CandidateFinding = Omit<Finding, "status" | "challenge"> & {
  status: "candidate";
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const CONFIDENCE_ORDER: Record<Confidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export const ALL_CATEGORIES: Category[] = [
  "correctness",
  "security",
  "performance",
  "architecture",
  "tests",
];
