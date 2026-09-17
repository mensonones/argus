import type { Challenge } from "../types.js";

export function challengeExecutionLabel(challenge: Challenge): string {
  const execution = challenge.execution;
  if (!execution) return "execution unspecified; independent delegation not established";
  if (execution.mode === "coordinator") return `coordinator validation (not an independent subagent): ${execution.detail}`;
  return `delegated subagent ${execution.agentId} (agent-reported, not host-verified): ${execution.detail}`;
}
