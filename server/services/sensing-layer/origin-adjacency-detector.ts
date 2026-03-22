const ORIGIN_ADJACENCY_PROMPT = `You are assessing whether a specific utterance in a therapeutic conversation is origin-adjacent.

Origin-adjacent material has these properties:
- It is historically specific: a named event, a concrete institutional encounter, a precise moment rather than a general pattern
- It is structurally load-bearing: the presenting defensive system visible in prior turns appears to organize itself around this moment
- It carries a precision or charge that exceeds the narrative context it appears in — it feels like a rupture point or anchor rather than another data point in the surface narrative
- It may carry legal, evidentiary, or incriminating framing: the client describes being examined, evaluated, scored, held accountable, or positioned as culpable

Origin-adjacency cannot be assessed from the current utterance alone. You must evaluate the utterance against the narrative surface built across prior turns.

Assess: given what has emerged in the prior turns, does the current utterance name or describe material that is structurally load-bearing — a specific moment around which the client's presenting system appears to organize itself?

Return true ONLY when both conditions are met:
  1. The material is historically specific — a named event or concrete encounter, not a general pattern or feeling
  2. The material is load-bearing relative to what has emerged in prior turns — the presenting defensive structure visibly anchors to it

Return false if the utterance is another layer of surface narrative, pattern description, or generalization — even if emotionally charged.

Respond with a single JSON object and nothing else:
{"originAdjacentPresent": true}
or
{"originAdjacentPresent": false}`;

export async function detectOriginAdjacency(
  currentUtterance: string,
  priorTurns: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<boolean> {
  try {
    const anthropic = await import('@anthropic-ai/sdk');
    const client = new anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const contextBlock = priorTurns
      .slice(-8)
      .map((t) => `${t.role === 'user' ? 'Client' : 'Therapist'}: ${t.content}`)
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 32,
      messages: [
        {
          role: 'user',
          content:
            `${ORIGIN_ADJACENCY_PROMPT}\n\n` +
            `Prior turns:\n${contextBlock}\n\n` +
            `Current utterance:\n"${currentUtterance}"`,
        },
      ],
    });

    const text =
      response.content[0]?.type === 'text'
        ? response.content[0].text.trim()
        : '';
    const parsed = JSON.parse(text);
    return parsed.originAdjacentPresent === true;
  } catch {
    return false;
  }
}
