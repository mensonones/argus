import path from "node:path";
const RULES = [
    { skill: "react-review", signal: "React", kind: "framework", reviewers: ["correctness", "security", "performance", "architecture", "tests"] },
    { skill: "node-test-review", signal: "Node.js test runner", kind: "test-runner", reviewers: ["tests"] },
];
function normalized(file) {
    const result = file.replaceAll("\\", "/");
    if (path.posix.isAbsolute(result) || /^[A-Za-z]:/.test(result) || result.split("/").some(p => p === ".." || ["node_modules", "vendor", ".git", ".argus"].includes(p)))
        return null;
    return path.posix.normalize(result);
}
/** Suggestions only: nearest inspected package boundary, never enable a lens. */
export function suggestStackSkills(stack, files, enabledReviewers) {
    const result = [];
    const manifests = [...stack.manifests].sort((a, b) => b.length - a.length || a.localeCompare(b));
    for (const manifest of manifests) {
        const scopedFiles = [...new Set(files.map(normalized).filter((f) => f !== null))].sort().filter(file => {
            if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file))
                return false;
            return manifests.find(m => {
                const dir = path.posix.dirname(m);
                return dir === "." || file.startsWith(`${dir}/`);
            }) === manifest;
        });
        for (const rule of RULES) {
            const reviewers = rule.reviewers.filter(r => enabledReviewers.includes(r));
            const evidence = stack.signals.filter(s => s.manifest === manifest && s.kind === rule.kind && s.name === rule.signal);
            const relevant = rule.skill === "node-test-review"
                ? scopedFiles.filter(f => /(?:^|\/)(?:test|tests)\//.test(f) || /(?:^|[./_-])(?:test|spec)(?:[._-]|$)/.test(path.posix.basename(f)))
                : scopedFiles;
            if (reviewers.length && evidence.length && relevant.length)
                result.push({ skill: rule.skill, manifest, files: relevant, reviewers, evidence, requiresCodeConfirmation: true });
        }
    }
    return result.sort((a, b) => `${a.manifest}:${a.skill}`.localeCompare(`${b.manifest}:${b.skill}`));
}
