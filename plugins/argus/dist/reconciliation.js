import { createHash } from "node:crypto";
export function findingsSignature(findings) {
    return createHash("sha256").update(JSON.stringify([...findings].sort((a, b) => a.id.localeCompare(b.id)))).digest("hex");
}
export function consolidateReconciled(findings, groups) {
    if (findings.some(f => f.status === "candidate"))
        throw new Error("Challenge all candidates before reconciliation.");
    const survivors = findings.filter(f => f.status === "confirmed");
    const byId = new Map(survivors.map(f => [f.id, f]));
    const covered = new Set();
    const result = groups.map(group => {
        const canonical = byId.get(group.canonical_id);
        if (!canonical || !group.members.some(m => m.finding_id === canonical.id)) {
            throw new Error("Canonical finding must be a surviving member of its group.");
        }
        const members = group.members.map(member => {
            const finding = byId.get(member.finding_id);
            if (!finding || covered.has(member.finding_id))
                throw new Error("Unknown, rejected or repeated reconciliation member.");
            if (finding.file !== canonical.file)
                throw new Error("A group must describe one root cause in the same file.");
            covered.add(finding.id);
            return { ...finding, category: member.category };
        });
        return {
            ...canonical,
            category: members.find(f => f.id === canonical.id).category,
            categories: Array.from(new Set(members.map(f => f.category))),
            detectedBy: Array.from(new Set(members.flatMap(f => f.detectedBy ?? [f.reviewer]))),
            rootCause: group.rootCause,
            rootCauseValidated: true,
            consolidation: { canonicalId: canonical.id, memberIds: members.map(f => f.id), reasoning: group.reasoning },
        };
    });
    if (covered.size !== survivors.length)
        throw new Error("Reconciliation must cover every surviving finding exactly once.");
    return { findings: result, removed: survivors.length - result.length };
}
