import { CONFIDENCE_ORDER, SEVERITY_ORDER } from "./types.js";
/** Do two findings' line ranges overlap (or sit within a few lines)? */
function linesOverlap(a, b) {
    if (!a.lines || !b.lines)
        return false;
    const pad = 3;
    return (a.lines.start - pad <= b.lines.end && b.lines.start - pad <= a.lines.end);
}
/** Conservative Jaccard similarity on title tokens. */
function titleSimilarity(a, b) {
    const ta = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
    const tb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
    if (ta.size === 0 || tb.size === 0)
        return 0;
    let inter = 0;
    for (const t of ta)
        if (tb.has(t))
            inter++;
    return inter / new Set([...ta, ...tb]).size;
}
function isDuplicate(a, b) {
    if (a.file !== b.file)
        return false;
    const similarity = titleSimilarity(a.title, b.title);
    // Nearby lines are only a location hint, never proof of a shared root cause.
    if (linesOverlap(a, b)) {
        return similarity >= (a.category === b.category ? 0.45 : 0.6);
    }
    // Without a shared location, require a strong title match and the same lens.
    return a.category === b.category && similarity >= 0.75;
}
function maxSeverity(a, b) {
    return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}
function maxConfidence(a, b) {
    return CONFIDENCE_ORDER[a] >= CONFIDENCE_ORDER[b] ? a : b;
}
/** Merge two duplicate findings into one, combining metadata. */
function merge(a, b) {
    const detectedBy = Array.from(new Set([...(a.detectedBy ?? [a.reviewer]), ...(b.detectedBy ?? [b.reviewer])]));
    const categories = Array.from(new Set([
        ...(a.categories ?? [a.category]),
        ...(b.categories ?? [b.category]),
    ]));
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
        detectedBy,
        challenge: a.challenge?.result === "CONFIRMED" ? a.challenge
            : b.challenge?.result === "CONFIRMED" ? b.challenge
                : primary.challenge,
        reviewer: detectedBy.join(", "),
    };
}
/**
 * Consolidate findings that multiple reviewers reported. Multiple reviewers
 * agreeing is itself a confidence signal (design doc §22).
 */
export function deduplicate(findings) {
    const merged = [];
    let removed = 0;
    for (const f of findings) {
        const existing = merged.findIndex((m) => isDuplicate(m, f));
        if (existing >= 0) {
            merged[existing] = merge(merged[existing], f);
            removed++;
        }
        else {
            merged.push({
                ...f,
                categories: f.categories ?? [f.category],
                detectedBy: f.detectedBy ?? [f.reviewer],
            });
        }
    }
    return { findings: merged, removed };
}
const CONFIRM_WEIGHT = {
    CONFIRMED: 1.0,
    PLAUSIBLE: 0.6,
    REJECTED: 0,
};
/**
 * Score = severity × confidence × challenge-strength × evidence-quality, plus a
 * small boost when multiple reviewers agreed. Ranking is NOT severity alone:
 * a high/high-confidence finding can outrank a critical/low-confidence one
 * (design doc §23).
 */
export function scoreFinding(f) {
    const sev = SEVERITY_ORDER[f.severity] + 1; // 1..5
    const conf = CONFIDENCE_ORDER[f.confidence] + 1; // 1..3
    const challenge = f.challenge ? CONFIRM_WEIGHT[f.challenge.result] ?? 0.6 : 0.6;
    const evidence = Math.min(f.evidence.length, 4) / 4 + 0.25; // 0.25..1.25
    const agreement = (f.detectedBy?.length ?? 1) > 1 ? 1.2 : 1.0;
    return sev * conf * challenge * evidence * agreement;
}
export function rank(findings) {
    return findings
        .map((f) => ({ ...f, score: scoreFinding(f) }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
