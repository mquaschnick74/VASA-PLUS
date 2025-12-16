// ═══════════════════════════════════════════════════════════════════════════════
// AGENT CONFIGURATION INDEX
// Central export point for all therapeutic agents
// Combines VASA agents (Sarah, Marcus, Mathew) with UNA agent
// ═══════════════════════════════════════════════════════════════════════════════

// Import VASA agents and types
import {
  THERAPEUTIC_AGENTS,
  TherapeuticAgent,
  getAgentById as getVASAAgentById
} from './agent-configs';

// Import UNA agent
import { UNA_AGENT } from './una';

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All therapeutic agents including both VASA agents and UNA
 * Use this array when you need access to all available agents
 */
export const ALL_AGENTS: TherapeuticAgent[] = [
  ...THERAPEUTIC_AGENTS,
  UNA_AGENT
];

/**
 * VASA agents only (Sarah, Marcus, Mathew)
 * Use this when you specifically need VASA methodology agents
 */
export const VASA_AGENTS = THERAPEUTIC_AGENTS;

/**
 * Get any agent by ID (searches all agents including UNA)
 * @param agentId - The agent ID to search for
 * @returns The matching agent or undefined
 */
export function getAgentById(agentId: string): TherapeuticAgent | undefined {
  return ALL_AGENTS.find(a => a.id === agentId);
}

/**
 * Get a VASA agent by ID (excludes UNA)
 * @param agentId - The agent ID to search for
 * @returns The matching VASA agent or undefined
 */
export function getVASAAgent(agentId: string): TherapeuticAgent | undefined {
  return getVASAAgentById(agentId);
}

/**
 * Check if an agent uses UNA methodology
 * @param agentId - The agent ID to check
 * @returns True if the agent is UNA
 */
export function isUNAAgent(agentId: string): boolean {
  return agentId.toLowerCase() === 'una';
}

/**
 * Check if an agent uses VASA methodology
 * @param agentId - The agent ID to check
 * @returns True if the agent uses VASA (not UNA)
 */
export function isVASAAgent(agentId: string): boolean {
  return THERAPEUTIC_AGENTS.some(a => a.id === agentId);
}

// Re-export types and individual exports for convenience
export type { TherapeuticAgent };
export { UNA_AGENT };
export { THERAPEUTIC_AGENTS };
