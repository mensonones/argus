export function challengeExecutionLabel(challenge) {
    const execution = challenge.execution;
    if (!execution)
        return "execution unspecified; independent delegation not established";
    if (execution.mode === "coordinator")
        return `coordinator validation (not an independent subagent): ${execution.detail}`;
    return `delegated subagent ${execution.agentId} (agent-reported, not host-verified): ${execution.detail}`;
}
