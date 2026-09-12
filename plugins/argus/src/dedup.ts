import type {
  Category,
  Confidence,
  Finding,
  Severity,
} from "./types.js";
import { CONFIDENCE_ORDER, SEVERITY_ORDER } from "./types.js";

/** Do two findings' line ranges overlap (or sit within a few lines)? */
function linesOverlap(a: Finding, b: Finding): boolean {
  if (!a.lines || !b.lines) return false;
  const pad = 3;
  return (
    a.lines.start - pad <= b.lines.end && b.lines.start - pad <= a.lines.end
  );
}

/** Conservative Jaccard similarity on title tokens. */
function titleSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / new Set([...ta, ...tb]).size;
}

function isDuplicate(a: Finding, b: Finding): boolean {
  if (a.file !== b.file) return false;
  const similarity = titleSimilarity(a.title, b.title);
  // Nearby lines are only a location hint, never proof of a shared root cause.
  if (linesOverlap(a, b)) {
    return similarity >= (a.category === b.category ? 0.45 : 0.6);
  }
  // Without a shared location, require a strong title match and the same lens.
  return a.category === b.category && similarity >= 0.75;
}

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}
function maxConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_ORDER[a] >= CONFIDENCE_ORDER[b] ? a : b;
}

/** Merge two duplicate findings into one, combining metadata. */
function merge(a: Finding, b: Finding): Finding {
  const detectedBy = Array.from(
    new Set([...(a.detectedBy ?? [a.reviewer]), ...(b.detectedBy ?? [b.reviewer])]),
  );
  const categories = Array.from(new Set([
    ...(a.categories ?? [a.category]),
    ...(b.categories ?? [b.category]),
  ])) as Category[];
  // Keep the richer description/evidence.
  const primary = a.evidence.length >= b.evidence.length ? a : b;
  const secondary = primary === a ? b : a;
  return {
    ...primary,
    category: primary.category,
    categories,
    severity: maxSeverity(a.severity, b.severity),
    confidence: maxConfidence(a.confidence, b.confidence),
    evidence: Array.from(new Set([...primary.evidence, ...secondary.evidence])),
    evidencePackage: a.challenge?.result === "CONFIRMED" ? a.evidencePackage
      : b.challenge?.result === "CONFIRMED" ? b.evidencePackage
        : primary.evidencePackage,
    detectedBy,
    challenge:
      a.challenge?.result === "CONFIRMED" ? a.challenge
        : b.challenge?.result === "CONFIRMED" ? b.challenge
          : primary.challenge,
    reviewer: detectedBy.join(", "),
  };
}

export interface DedupResult {
  findings: Finding[];
  removed: number;
}

/**
 * Consolidate findings that multiple reviewers reported. Multiple reviewers
 * agreeing is recorded as provenance, not proof of independent validation.
 */
export function deduplicate(findings: Finding[]): DedupResult {
  const merged: Finding[] = [];
  let removed = 0;

  for (const f of findings) {
    const existing = merged.findIndex((m) => isDuplicate(m, f));
    if (existing >= 0) {
      merged[existing] = merge(merged[existing], f);
      removed++;
    } else {
      merged.push({
        ...f,
        categories: f.categories ?? [f.category],
        detectedBy: f.detectedBy ?? [f.reviewer],
      });
    }
  }

  return { findings: merged, removed };
}

const CONFIRM_WEIGHT: Record<string, number> = {
  CONFIRMED: 1.0,
  PLAUSIBLE: 0.6,
  REJECTED: 0,
};

/**
 * Score = severity × confidence × challenge-strength × validation-strength.
 * Text volume and reviewer agreement do not inflate confidence. NOT severity alone:
 * a high/high-confidence finding can outrank a critical/low-confidence one
 * (design doc §23).
 */
export function scoreFinding(f: Finding): number {
  const sev = SEVERITY_ORDER[f.severity] + 1; // 1..5
  const conf = CONFIDENCE_ORDER[f.confidence] + 1; // 1..3
  const challenge = f.challenge ? CONFIRM_WEIGHT[f.challenge.result] ?? 0.6 : 0.6;
  // Conservative initial heuristic, not a calibrated probability of correctness.
  const packet = f.evidencePackage;
  const validation = !packet ? 1 : packet.method === "static-analysis" ? 1.1
    : packet.negativeControl ? 1.3 : 1.2;
  return sev * conf * challenge * validation;
}

export function rank(findings: Finding[]): Finding[] {
  return findings
    .map((f) => ({ ...f, score: scoreFinding(f) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
