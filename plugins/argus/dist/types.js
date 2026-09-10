/**
 * Core domain types for Argus.
 *
 * These mirror the Finding structure described in the design document
 * (section 13) with a few additions needed by the deduplicator/ranker.
 */
export const SEVERITY_ORDER = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
};
export const CONFIDENCE_ORDER = {
    low: 0,
    medium: 1,
    high: 2,
};
export const ALL_CATEGORIES = [
    "correctness",
    "security",
    "performance",
    "architecture",
    "tests",
];
