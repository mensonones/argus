import { createHash } from "node:crypto";
import { z } from "zod";
import { reconciliationSchema } from "./validation.js";
import type { Finding } from "./types.js";

export type ReconciliationGroup = z.infer<typeof reconciliationSchema>[number];

export function findingsSignature(findings: Finding[]): string {
  return createHash("sha256").update(JSON.stringify([...findings].sort((a, b) => a.id.localeCompare(b.id)))).digest("hex");
}

export function consolidateReconciled(findings: Finding[], groups: ReconciliationGroup[], requireCoverage = false) {
  if (findings.some(f => f.status === "candidate")) throw new Error("Challenge all candidates before reconciliation.");
  const survivors = findings.filter(f => f.status === "confirmed");
  const byId = new Map(survivors.map(f => [f.id, f]));
  const covered = new Set<string>();
  const result = groups.map(group => {
    const canonical = byId.get(group.canonical_id);
    if (!canonical || !group.members.some(m => m.finding_id === canonical.id)) {
      throw new Error("Canonical finding must be a surviving member of its group.");
    }
    const members = group.members.map(member => {
      const finding = byId.get(member.finding_id);
      if (!finding || covered.has(member.finding_id)) throw new Error("Unknown, rejected or repeated reconciliation member.");
      if (finding.file !== canonical.file) throw new Error("A group must describe one root cause in the same file.");
      covered.add(finding.id);
      return { ...finding, category: member.category };
    });
    if (members.length > 1 && requireCoverage) {
      if (!group.causal_analysis || !group.claim_coverage) throw new Error("Merged groups require causal_analysis and claim_coverage for canonical consequences.");
      const coverage = group.claim_coverage;
      if (members.some(member => !coverage.some(c => c.finding_id === member.id)) ||
          coverage.some(c => !members.some(member => member.id === c.finding_id))) {
        throw new Error("Claim coverage must reference every member and no foreign finding.");
      }
      for (const claim of coverage) {
        const source = members.find(member => member.id === claim.finding_id)!;
        if (![source.description, source.impact, ...source.evidence].some(text => text.includes(claim.source_claim))) {
          throw new Error("source_claim must quote current validated member content.");
        }
        if (!canonical.description.includes(claim.description_excerpt) ||
            !canonical.evidence.some(e => e.includes(claim.evidence_excerpt)) ||
            !canonical.impact.includes(claim.impact_excerpt)) {
          throw new Error("Retained claims must cite canonical description, evidence and impact, not just reconciliation reasoning.");
        }
        if (canonical.evidencePackage && (!claim.observation_excerpt ||
            !canonical.evidencePackage.observed.includes(claim.observation_excerpt))) {
          throw new Error("Claim coverage must cite the canonical packet's observed consequence.");
        }
      }
    }
    return {
      ...canonical,
      sourceCommits: members.some(f => f.sourceCommits?.length)
        ? Array.from(new Set(members.flatMap(f => f.sourceCommits ?? []))) : undefined,
      category: members.find(f => f.id === canonical.id)!.category,
      categories: Array.from(new Set(members.map(f => f.category))),
      detectedBy: Array.from(new Set(members.flatMap(f => f.detectedBy ?? [f.reviewer]))),
      rootCause: group.rootCause,
      rootCauseValidated: true,
      consolidation: { canonicalId: canonical.id, memberIds: members.map(f => f.id), reasoning: group.reasoning,
        causalAnalysis: group.causal_analysis, claimCoverage: group.claim_coverage },
    };
  });
  if (covered.size !== survivors.length) throw new Error("Reconciliation must cover every surviving finding exactly once.");
  return { findings: result, removed: survivors.length - result.length };
}
