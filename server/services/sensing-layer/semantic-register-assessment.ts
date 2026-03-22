// server/services/sensing-layer/semantic-register-assessment.ts
// Semantic register assessment via Haiku LLM call.
// No keyword matching — assesses structural situation of the utterance.

import type { Register, RegisterDistribution } from './types';

const REGISTER_PROMPT = `You are assessing the structural register of a client utterance in a therapeutic conversation.

Determine which of three registers the client is primarily operating in:

REAL: The client is in direct perceptual contact with experience. They are describing sensation, immediate feeling, or what is present in the body or environment before it has been processed into narrative or meaning. The material is pre-symbolic — it has not yet become a story about themselves or an analysis of their situation.

IMAGINARY: The client is in narrative or meaning-making relation to experience. They are constructing, defending, or elaborating a story — about themselves, about others, about events. The material is organized around self-concept, relational history, or explanation of how things are. This includes defensive intellectual structures that substitute description for contact — using technical or systematic language to keep experience at narrative distance rather than felt proximity.

SYMBOLIC: The client is in structural relation to their own experience. They are recognizing patterns, contradictions, or positions from a vantage outside the narrative — observing how things repeat, how desires contradict behavior, or how current dynamics echo historical ones. The material is meta-cognitive: the client is seeing structure rather than content, recognizing the shape of what they do rather than what happened.

Respond with a single JSON object and nothing else. Example format:
{"register":"Imaginary","distribution":{"Real":0.10,"Imaginary":0.75,"Symbolic":0.15},"structuralDescription":"The client is elaborating a narrative about their relationship, organizing experience around self-concept."}

Distribution values must sum to 1.0. structuralDescription is a situational characterization — describe what the client is doing, not which register they are in.`;

export interface SemanticRegisterOverlay {
  currentRegister: Register;
  registerDistribution: RegisterDistribution;
  structuralDescription: string;
}

export async function assessRegisterSemantic(
  utterance: string,
  conversationHistory: { role: string; content: string }[]
): Promise<SemanticRegisterOverlay | null> {
  try {
    const anthropic = await import('@anthropic-ai/sdk');
    const client = new anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const recentContext = conversationHistory
      .filter(t => t.role === 'user')
      .slice(-2)
      .map(t => `User: "${t.content.substring(0, 200)}"`)
      .join('\n');

    const contextBlock = recentContext
      ? `\nRecent context:\n${recentContext}\n`
      : '';

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `${REGISTER_PROMPT}${contextBlock}\nCurrent utterance:\n"${utterance}"`,
        },
      ],
    });

    const text =
      response.content[0]?.type === 'text'
        ? response.content[0].text.trim()
        : '';
    const parsed = JSON.parse(text);

    const validRegisters: Register[] = ['Real', 'Imaginary', 'Symbolic'];
    if (!validRegisters.includes(parsed.register)) return null;

    const dist = parsed.distribution;
    if (
      typeof dist?.Real !== 'number' ||
      typeof dist?.Imaginary !== 'number' ||
      typeof dist?.Symbolic !== 'number'
    ) return null;

    const total = dist.Real + dist.Imaginary + dist.Symbolic;
    if (total <= 0) return null;

    return {
      currentRegister: parsed.register as Register,
      registerDistribution: {
        Real: dist.Real / total,
        Imaginary: dist.Imaginary / total,
        Symbolic: dist.Symbolic / total,
      },
      structuralDescription: parsed.structuralDescription || '',
    };
  } catch {
    return null;
  }
}
