const CALL = /[A-Za-z_$][\w$.]*\((?:[^()]|\([^()]*\))*\)/g;
const MIN_LENGTH = 12;
function normalize(text) {
    return text.replace(/`/g, "").replace(/\s+/g, " ").trim();
}
/** Code-looking spans quoted in a recommendation: backticked text and call expressions. */
export function recommendedCode(recommendation) {
    if (!recommendation)
        return [];
    const spans = new Set();
    for (const match of recommendation.matchAll(/`([^`]+)`/g))
        spans.add(normalize(match[1]));
    for (const match of normalize(recommendation).matchAll(CALL))
        spans.add(normalize(match[0]));
    return [...spans].filter((span) => span.length >= MIN_LENGTH && /[()[\]]|=>/.test(span));
}
export function sameFixGroups(findings) {
    const byKey = new Map();
    findings.forEach((finding, index) => {
        for (const code of recommendedCode(finding.recommendation)) {
            const key = `${finding.file}\u0000${code}`;
            const entry = byKey.get(key) ?? { file: finding.file, code, indices: new Set() };
            entry.indices.add(index);
            byKey.set(key, entry);
        }
    });
    return [...byKey.values()]
        .filter((entry) => entry.indices.size > 1)
        .map((entry) => ({ file: entry.file, code: entry.code, indices: [...entry.indices].sort((a, b) => a - b) }));
}
/** For each finding position, the other positions that quote the same change. */
export function sameFixPeers(findings) {
    const out = new Map();
    for (const group of sameFixGroups(findings)) {
        for (const index of group.indices) {
            const entry = out.get(index) ?? { peers: [], code: group.code };
            for (const peer of group.indices)
                if (peer !== index && !entry.peers.includes(peer))
                    entry.peers.push(peer);
            if (group.code.length > entry.code.length)
                entry.code = group.code;
            out.set(index, entry);
        }
    }
    for (const entry of out.values())
        entry.peers.sort((a, b) => a - b);
    return out;
}
