import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
export const DEFAULT_CONFIG = {
    reviewers: {
        correctness: true,
        security: true,
        performance: true,
        architecture: true,
        tests: false,
    },
    severity: { minimum: "low" },
    review: { max_findings: 20 },
    ignore: [
        "**/*.generated.*",
        "**/vendor/**",
        "**/node_modules/**",
        ".argus/**",
    ],
    architecture: { rules: [] },
    security: { strict: true },
};
const configSchema = z.object({
    reviewers: z.object({
        correctness: z.boolean(),
        security: z.boolean(),
        performance: z.boolean(),
        architecture: z.boolean(),
        tests: z.boolean(),
    }).strict(),
    severity: z.object({
        minimum: z.enum(["info", "low", "medium", "high", "critical"]),
    }).strict(),
    review: z.object({ max_findings: z.number().int().positive().max(500) }).strict(),
    ignore: z.array(z.string()),
    architecture: z.object({ rules: z.array(z.string()) }).strict(),
    security: z.object({ strict: z.boolean() }).strict(),
}).strict();
/** The reviewer ids, in a stable priority order. */
export const REVIEWER_ORDER = [
    "correctness",
    "security",
    "performance",
    "architecture",
    "tests",
];
function isPlainObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
/** Deep-merge objects; arrays and scalars from the override replace the base. */
function deepMerge(base, override) {
    if (!isPlainObject(base) || !isPlainObject(override)) {
        return override ?? base;
    }
    const out = { ...base };
    for (const [key, value] of Object.entries(override)) {
        const baseVal = base[key];
        if (isPlainObject(value) && isPlainObject(baseVal)) {
            out[key] = deepMerge(baseVal, value);
        }
        else if (value !== undefined) {
            out[key] = value;
        }
    }
    return out;
}
/** Load argus.yaml (or argus.yml) from the repo root, merged over defaults. */
export function loadConfig(repoRoot) {
    for (const name of ["argus.yaml", "argus.yml"]) {
        const p = path.join(repoRoot, name);
        if (!fs.existsSync(p))
            continue;
        try {
            const text = fs.readFileSync(p, "utf8");
            const parsed = YAML.parse(text);
            return {
                config: configSchema.parse(deepMerge(DEFAULT_CONFIG, parsed)),
                source: p,
            };
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid Argus configuration at ${p}: ${detail}`);
        }
    }
    return { config: DEFAULT_CONFIG };
}
/** Reviewer ids enabled by config, in priority order. */
export function enabledReviewers(config) {
    return REVIEWER_ORDER.filter((id) => config.reviewers[id]);
}
/**
 * Convert a glob (supporting `**`, `**` + `/`, `*`, `?`) to an anchored RegExp
 * matched against a repo-relative POSIX path.
 */
function globToRegExp(glob) {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*") {
            if (glob[i + 1] === "*") {
                if (glob[i + 2] === "/") {
                    re += "(?:.*/)?"; // zero or more leading path segments
                    i += 2;
                }
                else {
                    re += ".*";
                    i += 1;
                }
            }
            else {
                re += "[^/]*";
            }
        }
        else if (c === "?") {
            re += "[^/]";
        }
        else if ("/.+^${}()|[]\\".includes(c)) {
            re += "\\" + c;
        }
        else {
            re += c;
        }
    }
    return new RegExp("^" + re + "$");
}
/** Does a repo-relative path match any of the ignore globs? */
export function isIgnored(filePath, ignore) {
    const normalized = filePath.split(path.sep).join("/");
    return ignore.some((g) => {
        try {
            return globToRegExp(g).test(normalized);
        }
        catch {
            return false;
        }
    });
}
