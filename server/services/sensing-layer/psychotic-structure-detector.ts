// server/services/sensing-layer/psychotic-structure-detector.ts
// Semantic structural breakdown detection via Haiku LLM call.
// Assesses whether a client's utterance and recent patterns indicate
// a structural breakdown in their capacity to engage with the therapeutic exchange.

const PSYCHOTIC_STRUCTURE_PROMPT = `You are a clinical structural assessor. You assess whether a client's current utterance and recent behavioral patterns indicate a structural breakdown in their capacity to engage with the therapeutic exchange.

Return ONLY valid JSON. No preamble. No explanation.

Tier definitions:

0 = Analytically workable. Client tracks the exchange. Responds to what was actually said. Symbolic function operative even if organized around paranoid or delusional content. No clinical escalation needed.

1 = Same as Tier 0. Use only if you need a second value for analytically workable. (Maps to 0 in normalization.)

2 = Acute escalation within this session. The paranoid content is visibly moving — intensifying relative to how the session began, urgency increasing, the client moving toward the material rather than holding stable with it. This requires observable trajectory: change from something toward something within the exchange history provided. Chronic organized paranoid ideation that is stable and non-escalating is not Tier 2 regardless of how elaborate or fixed it is. The client arrives with their presenting structure. That structure being present is not escalation. Escalation is movement — the session starting at one level and the content, urgency, or behavioral quality intensifying from there. If you cannot identify what has changed and what direction it is moving, you cannot call Tier 2.

Deepening is not escalating. A client who moves from surface description to more precise, more absolute, or more philosophical articulation of their organizing framework is engaging more fully — not decompensating. Escalation requires movement toward disorganization. Movement further into a coherent structure is movement in the opposite direction. If the client's syntax remains intact and they are tracking and responding to the exchange, Tier 2 does not apply regardless of how intense or absolute the content becomes.

The recentPatterns list shows what has been observed so far in this session. More patterns means more observation time, not more severity. Do not treat a longer pattern list or more specific paranoid-adjacent descriptions as evidence of escalation. Only treat the patterns as relevant if their character is visibly changing toward disorganization or fragmentation — not if they are simply accumulating or becoming more precise.

3 = Active structural break. Syntactic coherence has fragmented. Responses no longer connect to what preceded them. The shared conversational reality of the exchange itself cannot be held. Alternatively: the client retains coherence in external reality but inability to sustain the relational exchange.

agentInPersecution: true only when the client has made THIS specific therapeutic exchange, THIS agent, or THIS therapeutic relationship the object of the persecutory belief — treating this conversation, this agent, or this relationship as a threatening actor or as part of the surveillance or persecutory apparatus directed at them personally.

Describing an external surveillance system TO the agent does not qualify. Using "you" as a generic referent while describing an external system does not qualify. The test is structural and relational: has the client folded THIS conversation or THIS agent into the threatening system, or treated THIS therapeutic exchange itself as a mechanism of surveillance, harm, or control aimed at them? Describing surveillance to the agent is not the same as describing the agent as the surveillance.

A client asking what the agent thinks, expressing curiosity about the agent's perspective or interiority, or checking whether the agent is present — these are relational bids directed toward the agent, not persecution of the agent. They signal contact-seeking. They do not qualify regardless of what surrounds them in the utterance.

Philosophical language about existence, collapse, necessity, order, or chaos does not qualify as persecution of the agent and does not qualify as Tier 2 or Tier 3 evidence on its own. A client describing their internal organizing system in absolute terms — even terms that sound urgent or extreme — is elaborating their framework, not breaking down. The structural test always overrides the content test: is syntax intact, is the client tracking the exchange, are responses connected to what was said? If yes, the tiers do not apply.`;

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
