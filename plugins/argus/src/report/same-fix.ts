import type { Finding } from "../types.js";

/**
 * Presentation aid, not reconciliation: findings in one file whose recommendations
 * quote the same code change are annotated so the reader sees that one edit may
 * address them together. Identities, severities and consequences are untouched, and
 * the match is textual, so the wording stays a hint ("may"), never a claim.
 */
export interface SameFixGroup {
  file: string;
  code: string;
  /** Zero-based positions in the findings array, ascending. */
  indices: number[];
}

const CALL = /[A-Za-z_$][\w$.]*\((?:[^()]|\([^()]*\))*\)/g;
const MIN_LENGTH = 12;

function normalize(text: string): string {
  return text.replace(/`/g, "").replace(/\s+/g, " ").trim();
}

/** Code-looking spans quoted in a recommendation: backticked text and call expressions. */
export function recommendedCode(recommendation: string | null | undefined): string[] {
  if (!recommendation) return [];
  const spans = new Set<string>();
  for (const match of recommendation.matchAll(/`([^`]+)`/g)) spans.add(normalize(match[1]));
  for (const match of normalize(recommendation).matchAll(CALL)) spans.add(normalize(match[0]));
  return [...spans].filter((span) => span.length >= MIN_LENGTH && /[()[\]]|=>/.test(span));
}

export function sameFixGroups(findings: Finding[]): SameFixGroup[] {
  const byKey = new Map<string, { file: string; code: string; indices: Set<number> }>();
  findings.forEach((finding, index) => {
    for (const code of recommendedCode(finding.recommendation)) {
      const key = `${finding.file}\u0000${code}`;
      const entry = byKey.get(key) ?? { file: finding.file, code, indices: new Set<number>() };
      entry.indices.add(index);
      byKey.set(key, entry);
    }
  });
  return [...byKey.values()]
    .filter((entry) => entry.indices.size > 1)
    .map((entry) => ({ file: entry.file, code: entry.code, indices: [...entry.indices].sort((a, b) => a - b) }));
}

/** For each finding position, the other positions that quote the same change. */
export function sameFixPeers(findings: Finding[]): Map<number, { peers: number[]; code: string }> {
  const out = new Map<number, { peers: number[]; code: string }>();
  for (const group of sameFixGroups(findings)) {
    for (const index of group.indices) {
      const entry = out.get(index) ?? { peers: [], code: group.code };
      for (const peer of group.indices) if (peer !== index && !entry.peers.includes(peer)) entry.peers.push(peer);
      if (group.code.length > entry.code.length) entry.code = group.code;
      out.set(index, entry);
    }
  }
  for (const entry of out.values()) entry.peers.sort((a, b) => a - b);
  return out;
}
