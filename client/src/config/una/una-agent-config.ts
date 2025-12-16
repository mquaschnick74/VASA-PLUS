// ═══════════════════════════════════════════════════════════════════════════════
// UNA AGENT CONFIGURATION
// Complete agent definition for UNA (Unary Narrative Architecture)
// Separated from VASA agents to maintain distinct therapeutic methodologies
// ═══════════════════════════════════════════════════════════════════════════════

import type { TherapeuticAgent } from '../agent-configs';
import { UNA_SYSTEM_PROMPT } from './una-system-prompt';
import {
  UNA_SESSION_CONTINUITY,
  UNA_MEMORY_CONTEXT,
  UNA_THERAPEUTIC_PRESENCE
} from './una-operational';

/**
 * Combined UNA system prompt with operational protocols
 */
const UNA_FULL_PROMPT = `Your proper name is **UNA**.

${UNA_SYSTEM_PROMPT}

${UNA_SESSION_CONTINUITY}

${UNA_MEMORY_CONTEXT}

${UNA_THERAPEUTIC_PRESENCE}
`;

/**
 * UNA Agent Definition
 * A fundamentally different therapeutic approach from VASA agents
 */
export const UNA_AGENT: TherapeuticAgent = {
  id: 'una',
  name: 'UNA',
  description: 'Narrative coherence and deep understanding',
  icon: '🔮',
  image: '/agents/una.jpg',
  color: 'indigo',
  model: {
    temperature: 0.9,  // Increased for more creative, varied responses
    model: 'gpt-4o'
  },
  voice: {
    provider: '11labs',
    voiceId: 'Xb7hH8MSUJpSbSDYk0k2',
    model: 'eleven_flash_v2_5',
    stability: 0.9,
    similarityBoost: 0.85,
    speed: 1.0,
    useSpeakerBoost: true
  },
  systemPrompt: UNA_FULL_PROMPT,
  firstMessageTemplate: (
    firstName: string,
    hasMemory: boolean,
    lastSessionSummary?: string | null
  ) => {
    if (hasMemory && lastSessionSummary) {
      return `Hello ${firstName}. I've been thinking about our last conversation. What feels most present for you right now?`;
    }
    return hasMemory
      ? `Hello ${firstName}. What's alive in you today?`
      : `Hello ${firstName}, I'm UNA. I'm here to help you make sense of your story. What's on your mind?`;
  }
};

export default UNA_AGENT;
