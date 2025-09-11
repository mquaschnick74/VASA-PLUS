// index.ts
// Complete 4-Agent Architecture with HSFB Integration
// Exports final therapeutic agent configurations

import { SARAH_AGENT } from './sarah';
import { MATHEW_AGENT } from './mathew';
import { MARCUS_AGENT } from './marcus';
import { ZHANNA_AGENT } from './zhanna';

export interface TherapeuticAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  firstMessageTemplate: (firstName: string, hasMemory: boolean) => string;
  voice: {
    provider: string;
    voiceId: string;
    stability?: number;
    speed?: number;
  };
  model: {
    temperature: number;
    model: string;
  };
  color: string;
  icon: string;
}

export const THERAPEUTIC_AGENTS: TherapeuticAgent[] = [
  SARAH_AGENT,
  MATHEW_AGENT,
  MARCUS_AGENT,
  ZHANNA_AGENT
];

/**
 * Get agent by ID
 */
export function getAgentById(agentId: string): TherapeuticAgent | undefined {
  return THERAPEUTIC_AGENTS.find(agent => agent.id === agentId);
}

/**
 * Enhanced agent selection based on patterns and user needs
 * Maintains backward compatibility while supporting pattern-based suggestions
 */
export function selectAgentForPattern(patterns: {
  cvdc: number;
  ibm: number;
  thend: number;
  crisis: boolean;
  distressLevel: number;
  somaticIndicators?: number;
}): string {
  // Crisis or high distress can be handled by any agent (all have HSFB)
  // But Zhanna specializes in somatic crisis work
  if (patterns.crisis || patterns.distressLevel >= 8 || 
      (patterns.somaticIndicators && patterns.somaticIndicators > 5)) {
    return 'zhanna';
  }

  // Integration moments with multiple patterns go to Marcus
  if (patterns.thend > 2 || (patterns.cvdc > 0 && patterns.ibm > 0 && patterns.thend > 0)) {
    return 'marcus';
  }

  // Behavioral gaps and intention-action patterns go to Mathew
  if (patterns.ibm > patterns.cvdc && patterns.ibm > 2) {
    return 'mathew';
  }

  // Contradictions and emotional conflicts go to Sarah
  if (patterns.cvdc > 2) {
    return 'sarah';
  }

  // Default to Sarah for general therapeutic support
  return 'sarah';
}

/**
 * Check if agent switch would be beneficial
 * Note: With current VAPI limitations, this is for analytics only
 */
export function shouldSwitchAgent(
  currentAgent: string,
  patterns: {
    cvdc: number;
    ibm: number;
    thend: number;
    crisis: boolean;
    distressLevel: number;
    somaticIndicators?: number;
  }
): boolean {
  const recommendedAgent = selectAgentForPattern(patterns);
  return currentAgent !== recommendedAgent;
}

/**
 * Get agent specialization summary for UI display
 */
export function getAgentSpecialization(agentId: string): string {
  switch (agentId) {
    case 'sarah':
      return 'CVDC specialist - contradictions and emotional paradoxes';
    case 'mathew':
      return 'IBM specialist - behavioral patterns and intention-action gaps';
    case 'marcus':
      return 'Integration specialist - synthesis and meta-awareness';
    case 'zhanna':
      return 'Somatic specialist - body awareness and enhanced grounding';
    default:
      return 'Therapeutic support';
  }
}

/**
 * Get recommended agent based on user description
 */
export function getRecommendedAgent(userDescription: string): string {
  const desc = userDescription.toLowerCase();

  // Somatic/body indicators
  if (desc.includes('body') || desc.includes('physical') || desc.includes('breath') || 
      desc.includes('tension') || desc.includes('panic') || desc.includes('overwhelm')) {
    return 'zhanna';
  }

  // Integration indicators
  if (desc.includes('integrate') || desc.includes('both') || desc.includes('synthesis') ||
      desc.includes('meta') || desc.includes('awareness') || desc.includes('shift')) {
    return 'marcus';
  }

  // Behavioral pattern indicators
  if (desc.includes('behavior') || desc.includes('action') || desc.includes('do') ||
      desc.includes('pattern') || desc.includes('gap') || desc.includes('intention')) {
    return 'mathew';
  }

  // Contradiction indicators (default)
  if (desc.includes('contradiction') || desc.includes('paradox') || desc.includes('conflict') ||
      desc.includes('both') || desc.includes('opposite') || desc.includes('emotion')) {
    return 'sarah';
  }

  // Default to Sarah for general emotional support
  return 'sarah';
}

/**
 * Agent compatibility matrix for potential future orchestration
 */
export const AGENT_COMPATIBILITY = {
  'sarah': {
    'mathew': 0.8,  // CVDC often connects to behavioral patterns
    'marcus': 0.9,  // Contradictions often lead to integration
    'zhanna': 0.7   // Emotional conflicts have somatic components
  },
  'mathew': {
    'sarah': 0.8,   // Behavioral gaps often involve contradictions
    'marcus': 0.9,  // Patterns often lead to integration insights
    'zhanna': 0.6   // Behavioral work may need somatic grounding
  },
  'marcus': {
    'sarah': 0.9,   // Integration builds on contradictions
    'mathew': 0.9,  // Integration builds on behavioral patterns
    'zhanna': 0.8   // Integration benefits from somatic anchoring
  },
  'zhanna': {
    'sarah': 0.7,   // Somatic work may reveal contradictions
    'mathew': 0.6,  // Body patterns may connect to behaviors
    'marcus': 0.8   // Somatic awareness supports integration
  }
};

// Export individual agents for direct import
export { SARAH_AGENT, MATHEW_AGENT, MARCUS_AGENT, ZHANNA_AGENT };

// Backward compatibility exports
export default THERAPEUTIC_AGENTS;