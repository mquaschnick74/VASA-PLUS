// server/services/sensing-layer/meta-instruction-detector.ts
// Semantic meta-instruction detection via Haiku LLM call.
// No keyword matching — assesses functional structure of the utterance.

const META_INSTRUCTION_PROMPT = `You are assessing the functional structure of a single utterance in a therapeutic conversation.

Assess whether this utterance presents or describes material while simultaneously foreclosing interpretive engagement with that material. The speaker both offers content and pre-emptively declares it should not be interpreted, symbolized, or given meaning.

This structural situation can appear as:
- Stating something occurred while insisting it means nothing
- Describing something with precision while declaring it insignificant
- Reporting an experience while refusing any frame for it other than bare fact
- Presenting an observation while explicitly prohibiting the listener from treating it as meaningful

The specific words used are not the signal. The structural situation is.

Return true ONLY when both elements are present in the same utterance:
  1. Material is offered (something is described, reported, or stated)
  2. Interpretive foreclosure is enacted (the speaker pre-emptively declares the material should not be interpreted or given meaning)

Return false if the speaker is simply being brief, factual, or concise without the foreclosure structure. Brevity alone is not foreclosure.

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
