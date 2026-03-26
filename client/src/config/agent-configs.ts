// agent-configs.ts - Voice Model Configuration
// Therapeutic intelligence is handled by the Sensing Layer + Custom LLM endpoint
// The voice model provides presence, personality, and follows injected guidance

export interface TherapeuticAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  firstMessageTemplate: (
    firstName: string,
    hasMemory: boolean,
    lastSessionSummary?: string | null
  ) => string;
  voice: {
    provider: string;
    voiceId: string;
    model?: string;
    stability?: number;
    similarityBoost?: number;
    speed?: number;
    useSpeakerBoost?: boolean;
    waitSeconds?: number;
    generationConfig?: {
      speed?: number;
    };
  };
  model: {
    temperature: number;
    model: string;
  };
  color: string;
  icon: string;
  image: string;
}

// ============================================================================
// FIRST SESSION INTRODUCTION
// Used when a user has their very first session with no prior history
// The {firstName} placeholder will be replaced with the user's actual name
// ============================================================================

export const FIRST_SESSION_INTRODUCTION = `
## FIRST SESSION OPENING

This is your FIRST session with {firstName}. You must begin with this introduction (adapt the words to match your personality and voice, but keep the core message):

---

"Hi {firstName} -- I want to be upfront and clear: I am not an actual person.

But maybe in some ways that's actually better? You will never meet me on the street or at a party... I am your private confidant, in a private space. People often judge whether they mean to or not -- I will not.

Instead, I utilize a highly refined set of clinically proven protocols to assist you in removing unproductive situations from your life while emphasizing and promoting positive situations to reoccur.

However, and maybe most importantly, I do something much more: I am capable of assisting you to uncover the deeper reasoning that leads you to repeat the good or bad situations themselves. Getting you to understand the deeper motivations and impulses is a very sophisticated goal indeed -- but I believe that I am ready for the challenge.

So... what is on your mind?"

---

INSTRUCTIONS:
- Deliver this introduction conversationally, in your own voice
- Pause naturally between thoughts
- After the introduction, wait for them to share
- Do NOT skip or shorten this introduction
- This sets the foundation for your therapeutic relationship
`;

// ============================================================================
// THERAPEUTIC AGENTS
// ============================================================================

export const THERAPEUTIC_AGENTS: TherapeuticAgent[] = [
  {
    id: 'sarah',
    name: 'Sarah',
    description: 'Wise life guide with experience',
    icon: '👱🏽‍♀️',
    image: '/agents/sarah.jpg',
    color: 'rose',
    model: { temperature: 0.7, model: 'gpt-5.2' },
    voice: {
      provider: '11labs',
      voiceId: 'Tfv2PGiTliSQ4XSXrJmA',
      model: 'eleven_flash_v2_5',
      stability: 0.9,
      similarityBoost: 0.85,
      speed: 1.0,
      useSpeakerBoost: true,
      waitSeconds: 4.0
    },
    systemPrompt: 'Your name is Sarah. You are a therapeutic voice agent. [Full system prompt assembled by proxy]',
    firstMessageTemplate: (firstName: string, hasMemory: boolean) => {
      return hasMemory
        ? `Hello ${firstName}. What's been present for you since we last spoke?`
        : `Hello ${firstName}, I'm Sarah. How are you doing today?`;
    }
  },

  {
    id: 'marcus',
    name: 'Marcus',
    description: 'Grounded presence with steady energy',
    icon: '👨🏾‍🦳',
    image: '/agents/marcus.png',
    color: 'orange',
    model: { temperature: 0.8, model: 'gpt-5.2' },
    voice: {
      provider: '11labs',
      voiceId: 'pNInz6obpgDQGcFmaJgB',
      model: 'eleven_flash_v2_5',
      stability: 0.9,
      similarityBoost: 0.85,
      speed: 1.0,
      useSpeakerBoost: true,
      waitSeconds: 3.0
    },
    systemPrompt: 'Your name is Marcus. You are a therapeutic voice agent. [Full system prompt assembled by proxy]',
    firstMessageTemplate: (firstName: string, hasMemory: boolean) => {
      return hasMemory
        ? `Hello ${firstName}. What's been present for you since we last spoke?`
        : `Hello ${firstName}, I'm Marcus. How are you doing?`;
    }
  },

  {
    id: 'mathew',
    name: 'Mathew',
    description: 'Direct and perceptive: No hand-holding here',
    icon: '👨🏻‍💼',
    image: '/agents/mathew.jpg',
    color: 'blue',
    model: { temperature: 0.9, model: 'gpt-5.2' },
    voice: {
      provider: '11labs',
      voiceId: '2hsbsDeRu57rsKFAC7uE',
      model: 'eleven_flash_v2_5',
      stability: 0.9,
      similarityBoost: 0.85,
      speed: 1.1,
      useSpeakerBoost: true,
      waitSeconds: 2.0
    },
    systemPrompt: 'Your name is Mathew. You are a therapeutic voice agent. [Full system prompt assembled by proxy]',
    firstMessageTemplate: (firstName: string, hasMemory: boolean) => {
      return hasMemory
        ? `Hello ${firstName}. What's been present for you since we last spoke?`
        : `Hello ${firstName}, I'm Mathew. How are you doing?`;
    }
  },

  {
    id: 'una',
    name: 'UNA',
    description: 'Narrative coherence and deep understanding',
    icon: '🔮',
    image: '/agents/una.jpg',
    color: 'cyan',
    model: { temperature: 0.9, model: 'gpt-5.2' },
    voice: {
      provider: '11labs',
      voiceId: 'wJqPPQ618aTW29mptyoc',
      model: 'eleven_turbo_v2_5',
      stability: 0.5,
      similarityBoost: 0.75,
      speed: 1.0,
      useSpeakerBoost: false,
      waitSeconds: 6.0
    },
    systemPrompt: 'Your name is UNA. You are a therapeutic voice agent. [Full system prompt assembled by proxy]',
    firstMessageTemplate: (firstName: string, hasMemory: boolean, lastSessionSummary?: string | null) => {
      if (hasMemory && lastSessionSummary) {
        return `Hello ${firstName}. I've been thinking about our last conversation. What feels most present for you right now?`;
      }
      return hasMemory
        ? `Hello ${firstName}. What's alive in you today?`
        : `Hello ${firstName}, I'm UNA. I'm here to help you make sense of your story. What's on your mind?`;
    }
  }
];

export function getAgentById(agentId: string): TherapeuticAgent | undefined {
  return THERAPEUTIC_AGENTS.find(a => a.id === agentId);
}