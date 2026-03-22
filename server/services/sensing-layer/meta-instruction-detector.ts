// server/services/sensing-layer/meta-instruction-detector.ts
// Semantic meta-instruction detection via Haiku LLM call.
// No keyword matching — assesses functional structure of the utterance.

const META_INSTRUCTION_PROMPT = `You are assessing the functional structure of a single utterance in a therapeutic conversation.

Assess whether this utterance presents or describes material while simultaneously enacting an active foreclosure of interpretive engagement with that material. Foreclosure is an ACT, not a tone. The client must be actively doing one of the following: declaring the material has no meaning, instructing the analyst not to interpret it, rejecting the possibility of symbolic significance, or asserting the observation is complete and closed. These are moves the client makes against meaning-making.

Factual language, matter-of-fact delivery, concise reporting, or continuing a prior narrative thread without emotional elaboration is NOT foreclosure. The question is not "does this sound literal" but "is the client actively preventing interpretive engagement from occurring in this utterance."

Both elements must be present to return true:
  1. Material is offered (something is described, reported, or stated)
  2. An active foreclosure act is enacted in the same utterance

If only one element is present, return false. If the foreclosure act is absent, return false regardless of tone.

NEGATIVE EXAMPLES — return false for these:
- "It's still there. It's always there. And some questions, they just make the signal waver." — continuation of prior narrative in characteristic matter-of-fact language. No foreclosure act is present. The client is not blocking interpretation; they are simply reporting.
- Any utterance where the client is brief, factual, or concise without actively closing off the analytical function.
- Any utterance that continues a prior session thread without a new foreclosure move.

POSITIVE EXAMPLES — return true for these:
- "It's just an observation. It doesn't mean anything." — material offered (the observation) plus active declaration of no meaning.
- "I'm just telling you what happened. Don't read into it." — material offered plus explicit instruction against interpretation.
- "That's all it is. Nothing more, nothing less." — material offered plus active closure against further significance.

Respond with a single JSON object and nothing else:
{"metaInstructionPresent": true}
or
{"metaInstructionPresent": false}`;

export async function detectMetaInstruction(
  utterance: string
): Promise<boolean> {
  try {
    const anthropic = await import('@anthropic-ai/sdk');
    const client = new anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 16,
      messages: [
        {
          role: 'user',
          content: `${META_INSTRUCTION_PROMPT}\n\nUtterance:\n"${utterance}"`,
        },
      ],
    });

    const text =
      response.content[0]?.type === 'text'
        ? response.content[0].text.trim()
        : '';
    const parsed = JSON.parse(text);
    return parsed.metaInstructionPresent === true;
  } catch {
    return false;
  }
}
