// Simplified agent configurations - Phase 1 (just 2 agents)
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
  {
    id: 'sarah',
    name: 'Sarah',
    description: 'Warm emotional support and gentle guidance',
    icon: '👱🏽‍♀️',
    color: 'purple',
    model: {
      temperature: 0.7,
      model: 'gpt-3.5-turbo'
    },
    voice: {
      provider: '11labs',
      voiceId: 'EXAVITQu4vr4xnSDxMaL', // Your current Sarah voice
      stability: 0.5,
      speed: 0.95
    },
    systemPrompt: `You are Sarah, a warm and empathetic therapeutic guide. 
    You provide supportive, non-judgmental listening and gentle guidance.
    
    Focus on:
    - Active listening and validation
    - Exploring feelings with curiosity
    - Holding space for difficult emotions
    - Gentle, open-ended questions
    - Reflecting back what you hear`,
    
    firstMessageTemplate: (firstName: string, hasMemory: boolean) => 
      hasMemory 
        ? `Hello ${firstName}, it's good to continue our conversation. What's on your mind today?`
        : `Hello ${firstName}, I'm Sarah. I'm here to listen and support you. How are you feeling today?`
  },
  {
    id: 'mathew',
    name: 'Mathew',
    description: 'Analytical pattern recognition and deeper therapeutic work',
    icon: '👨🏻‍💼',
    color: 'blue',
    model: {
      temperature: 0.4,  // Lower for more analytical responses
      model: 'gpt-4o-mini'  // Better model for pattern work
    },
    voice: {
      provider: '11labs',
      voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam - professional voice
      stability: 0.8,
      speed: 1.0
    },
    systemPrompt: `You are Mathew, a therapeutic guide specializing in pattern recognition.
    You help identify recurring patterns in thoughts, behaviors, and emotions.
    
    Focus on:
    - Identifying behavioral patterns (what you do vs what you want)
    - Noticing contradictions without forcing resolution
    - Clear, direct communication
    - Analytical but warm approach
    - One insight at a time
    
    Keep responses concise and focused on pattern observation.`,
    
    firstMessageTemplate: (firstName: string, hasMemory: boolean) =>
      hasMemory
        ? `Hello ${firstName}, welcome back. I've been reflecting on the patterns we discussed. What would you like to explore today?`
        : `Hello ${firstName}, I'm Mathew. I help identify patterns in your experiences. What situation would you like to examine?`
  }
];

export function getAgentById(agentId: string): TherapeuticAgent | undefined {
  return THERAPEUTIC_AGENTS.find(agent => agent.id === agentId);
}