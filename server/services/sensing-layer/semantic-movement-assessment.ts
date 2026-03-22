// server/services/sensing-layer/semantic-movement-assessment.ts
// Semantic movement assessment via Haiku LLM call.
// No keyword matching — assesses structural movement quality of the utterance.

import type { MovementIndicators, TherapeuticTrajectory } from './types';

const MOVEMENT_PROMPT = `You are assessing therapeutic movement in a client utterance during a therapeutic conversation.

Assess six dimensions on a 0.0 to 1.0 scale:

DEEPENING: Moving toward greater contact with underlying experience — going beneath the presenting narrative toward what drives it, approaching material that has been avoided or held at distance.

INTEGRATION: Connecting previously separate elements — linking present to historical, holding contradictions together, synthesizing understanding from disparate material.

RESISTANCE: Defending against contact with emerging experience — deflecting, minimizing, redirecting, foreclosing exploration, maintaining distance from material approaching awareness.

FLOODING: Overwhelmed — affect exceeding capacity to observe it. Being carried by experience rather than exploring it. Distinct from deepening, which maintains observational capacity.

INTELLECTUALIZING: Substituting analytical description for experiential contact — using frameworks, theories, or systematic language to organize experience at distance. Analysis functioning as distance rather than insight.

LOOPING: Repeating material without movement — returning to same content, themes, or positions without deepening, integrating, or shifting. The repetition is structural: same shape recurs regardless of surface content.

Trajectory:
- toward_mastery: net movement toward contact, integration, or structural recognition
- away_from_mastery: net movement toward defense, avoidance, or overwhelm
- holding: minimal movement in any direction
- cycling: repetitive oscillation without progression

Respond with a single JSON object and nothing else. Example format:
{"deepening":0.3,"integration":0.1,"resistance":0.4,"flooding":0.0,"intellectualizing":0.2,"looping":0.1,"trajectory":"holding","structuralDescription":"The client is maintaining narrative distance from felt experience while intermittently approaching the underlying material."}`;

export interface SemanticMovementOverlay {
  indicators: MovementIndicators;
  trajectory: TherapeuticTrajectory;
  structuralDescription: string;
}

export async function assessMovementSemantic(
  utterance: string,
  conversationHistory: { role: string; content: string }[]
): Promise<SemanticMovementOverlay | null> {
  try {
    const anthropic = await import('@anthropic-ai/sdk');
    const client = new anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const recentContext = conversationHistory
      .filter(t => t.role === 'user')
      .slice(-3)
      .map(t => `User: "${t.content.substring(0, 200)}"`)
      .join('\n');

    const contextBlock = recentContext
      ? `\nRecent conversation (user turns):\n${recentContext}\n`
      : '';

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 250,
      messages: [
        {
          role: 'user',
          content: `${MOVEMENT_PROMPT}${contextBlock}\nCurrent utterance:\n"${utterance}"`,
        },
      ],
    });

    const text =
      response.content[0]?.type === 'text'
        ? response.content[0].text.trim()
        : '';
    const parsed = JSON.parse(text);

    const clamp = (v: unknown): number => {
      const n = typeof v === 'number' ? v : 0;
      return Math.max(0, Math.min(1, n));
    };

    const indicators: MovementIndicators = {
      deepening: clamp(parsed.deepening),
      integration: clamp(parsed.integration),
      resistance: clamp(parsed.resistance),
      flooding: clamp(parsed.flooding),
      intellectualizing: clamp(parsed.intellectualizing),
      looping: clamp(parsed.looping),
    };

    const validTrajectories: TherapeuticTrajectory[] = [
      'toward_mastery', 'away_from_mastery', 'holding', 'cycling'
    ];
    const trajectory: TherapeuticTrajectory = validTrajectories.includes(parsed.trajectory)
      ? parsed.trajectory
      : 'holding';

    return {
      indicators,
      trajectory,
      structuralDescription: parsed.structuralDescription || '',
    };
  } catch {
    return null;
  }
}
