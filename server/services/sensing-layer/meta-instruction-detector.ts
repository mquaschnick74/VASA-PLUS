// server/services/sensing-layer/meta-instruction-detector.ts
// Semantic meta-instruction detection via Haiku LLM call.
// No keyword matching — assesses functional structure of the utterance.

const META_INSTRUCTION_PROMPT = `You are assessing the functional structure of a single utterance in a therapeutic conversation.

Return true only when both of the following are structurally present in the utterance:

(1) The client offers material — describes, reports, or states something.

(2) The client enacts a move aimed at the analyst's interpretive function — acting to prevent meaning-making from occurring, not merely describing content as factual. This move is directional: it is aimed at what the analyst might do with the material, not at the material itself. It forecloses the analytical function.

Foreclosure is an act aimed at the analyst, not a tone or a description of content. A client who speaks in matter-of-fact language, continues prior narrative, or is simply concise is oriented toward content. A client who is foreclosing is oriented against analysis. That orientation is the signal. Tone is not.

If both structural elements are not present, return false. If any ambiguity exists about whether element (2) is present, return false.

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
