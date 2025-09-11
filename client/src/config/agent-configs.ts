// agent-configs.ts - Updated to use new 4-agent architecture
export { 
  THERAPEUTIC_AGENTS, 
  getAgentById,
  selectAgentForPattern,
  shouldSwitchAgent,
  getAgentSpecialization,
  getRecommendedAgent
} from './agents/index';

// Re-export the type explicitly
export type { TherapeuticAgent } from './agents/index';