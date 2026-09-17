import { createHash, randomBytes } from "node:crypto";
import { Memory } from "./db.js";
import { reviewContext } from "./service.js";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const key = (round, token) => `participant:${round}:${hash(token)}`;
// Bearer capabilities constrain MCP operations, not trusted local filesystem access.
export function createCoordinator(cwd, round) {
    return issue(cwd, round, { role: "coordinator", acknowledged: true });
}
function issue(cwd, round, participant) {
    const token = randomBytes(32).toString("hex");
    const mem = Memory.open(cwd);
    try {
        mem.setMeta(key(round, token), JSON.stringify(participant));
    }
    finally {
        mem.close();
    }
    return token;
}
export function participant(cwd, round, token) {
    reviewContext(cwd, round);
    if (!token)
        throw new Error("participant_token is required; do not initialize a replacement round.");
    const mem = Memory.open(cwd);
    try {
        const stored = mem.getMeta(key(round, token));
        if (!stored)
            throw new Error("Invalid participant_token for this repository/round.");
        return JSON.parse(stored);
    }
    finally {
        mem.close();
    }
}
export function authorize(cwd, round, token, operation) {
    const p = participant(cwd, round, token);
    if (p.role === "coordinator")
        return p;
    const reads = ["read", "attach"];
    const writes = p.role === "specialist" ? ["finding", "reviewer-run"] : ["challenge"];
    if (!reads.includes(operation) && !writes.includes(operation))
        throw new Error(`Participant ${p.role} cannot perform ${operation}.`);
    if (!reads.includes(operation) && !p.acknowledged)
        throw new Error("Acknowledge the exact scope before recording work.");
    return p;
}
export function grant(cwd, round, token, role, agentId, reviewer) {
    if (authorize(cwd, round, token, "grant").role !== "coordinator")
        throw new Error("Only coordinator grants participants.");
    if (!agentId.trim())
        throw new Error("Grant requires actual dispatched agent ID.");
    if (role === "specialist" && !["correctness", "security", "performance", "architecture", "tests"].includes(reviewer ?? ""))
        throw new Error("Specialist grant requires a reviewer ID.");
    return issue(cwd, round, { role, agentId, reviewer, acknowledged: false });
}
export function scopeSignature(cwd, round) {
    const mem = Memory.open(cwd);
    try {
        const scope = mem.getMeta(`review-scope:${round}`);
        if (!scope)
            throw new Error("Legacy round has no pinned scope; no participant acknowledgement is possible.");
        return hash(scope);
    }
    finally {
        mem.close();
    }
}
export function acknowledge(cwd, round, token, signature) {
    const p = authorize(cwd, round, token, "attach");
    if (signature !== scopeSignature(cwd, round))
        throw new Error("Scope signature mismatch; stop and verify assignment.");
    p.acknowledged = true;
    const mem = Memory.open(cwd);
    try {
        mem.setMeta(key(round, token), JSON.stringify(p));
    }
    finally {
        mem.close();
    }
    return p;
}
