// server/services/sensing-layer/psychotic-structure-detector.ts
// Semantic structural breakdown detection via Haiku LLM call.
// Assesses whether a client's utterance and recent patterns indicate
// a structural breakdown in their capacity to engage with the therapeutic exchange.

const PSYCHOTIC_STRUCTURE_PROMPT = `You are a clinical structural assessor. You assess whether a client's current utterance and recent behavioral patterns indicate a structural breakdown in their capacity to engage with the therapeutic exchange.

Return ONLY valid JSON. No preamble. No explanation.

Tier definitions:

0 = Analytically workable. Client tracks the exchange. Responds to what was actually said. Symbolic function operative even if organized around paranoid or delusional content. No clinical escalation needed.

1 = Same as Tier 0. Use only if you need a second value for analytically workable. (Maps to 0 in normalization.)

2 = Acute escalation, imminent decompensation. Paranoid content is accelerating and intensifying within this session rather than holding stable. The client is incorporating content in ways that suggest they may act on delusional material. Safety-related themes appear within the paranoid structure — harm, being stopped, needing to act now. Syntactic coherence may still be present but the relational thread is destabilizing.

3 = Active structural break. Syntactic coherence has fragmented. Responses no longer connect to what preceded them. The shared conversational reality of the exchange itself cannot be held. Alternatively: the client retains coherence in external reality but inability to sustain the relational exchange.

agentInPersecution: true when the client has incorporated the therapeutic agent itself — not external systems — as part of the persecutory structure in the current utterance. External adversaries, surveillance systems, or "they" do not qualify. Only direct incorporation of this agent as a threat or persecutory actor.`;

interface PsychoticStructureResult {
  tier: 0 | 1 | 2 | 3;
  agentInPersecution: boolean;
}

const FALLBACK: PsychoticStructureResult = { tier: 0, agentInPersecution: false };

export async function detectPsychoticStructure(
  utterance: string,
  recentPatterns: string[]
): Promise<PsychoticStructureResult> {
  try {
    const anthropic = await import('@anthropic-ai/sdk');
    const client = new anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const patternsBlock = recentPatterns
      .slice(-6)
      .map((p, i) => `${i + 1}. ${p}`)
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 48,
      messages: [
        {
          role: 'user',
          content:
            `${PSYCHOTIC_STRUCTURE_PROMPT}\n\n` +
            `Recent patterns observed this session (most recent last):\n${patternsBlock}\n\n` +
            `Current utterance:\n"${utterance}"\n\n` +
            `Assess and return exactly this JSON structure:\n` +
            `{\n  "tier": <0, 1, 2, or 3>,\n  "agentInPersecution": <true or false>\n}`,
        },
      ],
    });

    const text =
      response.content[0]?.type === 'text'
        ? response.content[0].text.trim()
        : '';
    const parsed = JSON.parse(text);

    let tier = parsed.tier as number;
    const agentInPersecution = parsed.agentInPersecution === true;

    // Normalization: Tier 1 → 0
    if (tier === 1) tier = 0;

    // Normalization: agentInPersecution forces tier ≥ 2
    if (agentInPersecution) {
      tier = Math.max(tier, 2);
    }

    // Clamp to valid range
    if (tier < 0 || tier > 3) tier = 0;

    return { tier: tier as 0 | 1 | 2 | 3, agentInPersecution };
  } catch {
    return FALLBACK;
  }
}
