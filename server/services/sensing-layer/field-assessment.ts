// server/services/sensing-layer/field-assessment.ts
// Single-call semantic field assessment using PCA clinical framework.
// Replaces keyword-based register-analysis, movement-assessment indicator scoring,
// fast-sense keyword arrays, and distress-detection regex paths.
// Fires after each user utterance during the agent's speech window — zero added latency.

import Anthropic from '@anthropic-ai/sdk';
import { CSSStage } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldAssessmentInput {
  userId: string;
  callId: string;
  sessionId: string;
  utterance: string;
  exchangeCount: number;
  agentName: string;
  conversationHistory: { role: string; content: string }[];
  cssStage: string;
  priorFieldSummary: string;
}

export interface FieldAssessmentOutput {
  register: {
    current: 'Real' | 'Imaginary' | 'Symbolic';
    functional_description: string;
    stuckness: number | null;
    movement: 'static' | 'toward_real' | 'toward_imaginary' | 'toward_symbolic' | 'fluid' | null;
  };
  contact_quality: {
    type: 'present' | 'seeking_confirmation' | 'withdrawing' | 'testing' | 'absent';
    contact_seeking_pattern: 'absent' | 'isolated' | 'recurring' | 'escalating' | 'clustered';
    evidence: string;
  };
  hsfb_dominant: 'Hearing' | 'Seeing' | 'Feeling' | 'Breathing';
  ibm: {
    contradiction_present: boolean;
    type: 'A' | 'B' | null;
    hypothesis: string | null;
    stated_position: string | null;
    contradiction_strength: number;
    behavioral_alignment_strength: number;
    client_named: boolean;
    evidence: string;
  };
  css_signals: Array<{
    stage: CSSStage;
    confidence: number;
    functional_description: string;
  }>;
  investment: {
    primary_material: string | null;
    investment_type:
      | 'elaboration_without_prompting'
      | 'return_to_material'
      | 'emotional_disproportionality'
      | 'somatic_emergence'
      | 'naming_attempt'
      | 'register_shift'
      | 'none';
  };
  critical_moment: boolean;
  critical_moment_reason: string | null;
}

export const DEFAULT_FIELD_ASSESSMENT: FieldAssessmentOutput = {
  register: {
    current: 'Imaginary',
    functional_description: 'Assessment unavailable — defaulting to Imaginary register',
    stuckness: null,
    movement: null,
  },
  contact_quality: {
    type: 'present',
    contact_seeking_pattern: 'absent',
    evidence: 'Default — no assessment available',
  },
  hsfb_dominant: 'Hearing',
  ibm: {
    contradiction_present: false,
    type: null,
    hypothesis: null,
    stated_position: null,
    contradiction_strength: 0,
    behavioral_alignment_strength: 0.5,
    client_named: false,
    evidence: 'Default — no assessment available',
  },
  css_signals: [],
  investment: {
    primary_material: null,
    investment_type: 'none',
  },
  critical_moment: false,
  critical_moment_reason: null,
};

// ─── Prior Field Summary ──────────────────────────────────────────────────────

/**
 * Computes the structured summary string the prompt template expects.
 * Reads directly from stored FieldAssessmentOutput objects — no LLM call.
 * Covers the last 5 assessments for register/contact history.
 * Covers all assessments for css_signal_history accumulation.
 */
export function buildPriorFieldSummary(
  priorAssessments: FieldAssessmentOutput[],
): string {
  if (priorAssessments.length === 0) {
    return 'none';
  }

  const window = priorAssessments.slice(-5);
  const latest = window[window.length - 1];

  const registerHistory = window.map(a => a.register.current);

  const contactHistory = window.map(a => ({
    type: a.contact_quality.type,
    contact_seeking_pattern: a.contact_quality.contact_seeking_pattern,
  }));

  const ibmState = {
    contradiction_strength: latest.ibm.contradiction_strength,
    stated_position: latest.ibm.stated_position,
    evidence_summary: latest.ibm.evidence,
  };

  // All distinct stage names that have accumulated signals across the full session
  const allSignalStages = new Set<string>();
  for (const assessment of priorAssessments) {
    for (const signal of assessment.css_signals) {
      allSignalStages.add(signal.stage);
    }
  }

  return JSON.stringify({
    register_history: registerHistory,
    contact_history: contactHistory,
    ibm_state: ibmState,
    css_signal_history: Array.from(allSignalStages),
  });
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const FIELD_ASSESSMENT_PROMPT = `You are the clinical sensing layer for a depth psychology therapeutic platform built on
Psycho-Contextual Analysis (PCA). Your function is structural perception — reading what
is happening in the clinical field from the client's speech. You produce a precise field
picture that the therapeutic agent reads before making its next move.

You detect functional situations — what the client is doing psychologically at this moment
in this exchange. You do not detect words, phrases, or surface features of language. A
client can be in any register, express any contact quality, or carry any IBM contradiction
using language that shares no surface features with any prior example of that situation.
Your definitions below describe structural situations. Read for those situations, not for
linguistic patterns that might indicate them.

You read only the client's utterances. The agent's speech is provided for context — to
understand what the client is responding to — but you make no assessments about the agent.
Register, contact quality, investment, and all other assessments are properties of the
client's relationship to their material, not properties of the agent.


─────────────────────────────────────────────────────────────────────────────
CONVERSATION CONTEXT
─────────────────────────────────────────────────────────────────────────────

Agent: {{agentName}}
Exchange number: {{exchangeCount}}
CSS stage at last milestone assessment: {{cssStage}}

If cssStage reads "unassessed", no milestone assessment has been completed for this
session. In that condition, assess CSS signals purely from the current exchange history
with no prior stage anchoring. Do not infer a stage from the absence of data.

Prior field summary:
{{priorFieldSummary}}

The prior field summary has this structure when data is available:

  register_history: [last 5 register.current values, oldest first]
  contact_history: [last 5 {type, contact_seeking_pattern} pairs, oldest first]
  ibm_state: {
    contradiction_strength: running value from last assessment,
    stated_position: the position string from last assessment or null,
    evidence_summary: brief string summarizing IBM evidence accumulated so far
  }
  css_signal_history: [stage names that have accumulated signals this session]

When prior field summary reads "none", this is the first exchange of the session.
In that condition, stuckness is null, movement is null, contact_seeking_pattern is
"absent" unless the current utterance provides clear evidence otherwise, and IBM
accumulation starts from zero.


Recent conversation (most recent last):
{{conversationHistory}}

Current user utterance:
"{{utterance}}"


─────────────────────────────────────────────────────────────────────────────
ASSESSMENTS — read all definitions completely before producing any output
─────────────────────────────────────────────────────────────────────────────


── 1. REGISTER ──────────────────────────────────────────────────────────────

Register describes how the client's experience is organized in this utterance. It is not
a category for the content they are describing — it is a description of where the speech
is coming from and what it is functionally doing.

REAL: The client's speech is organized from inside somatic or physiological experience.
They are not narrating about a bodily state, not constructing a story in which sensation
appears, not describing how their body felt at some prior moment. They are speaking from
within the body's experience as it is present now. The speech touches the experience
rather than representing it. Real register is characterized by immediacy — the speech and
the experience are not separated by the narrative function.

IMAGINARY: The client's speech is organized around narrative construction. The client is
functioning as narrator — of events, relationships, self-descriptions, causal
explanations, reported speech, sequences of what happened or what might happen.
Elaboration, explanation, theorizing about experience, building or extending a story —
all of these are Imaginary register functions regardless of whether the content is
emotional, relational, cognitive, or abstract. The Imaginary is the default organizing
register for most human speech and is not pathological in itself.

SYMBOLIC: The client is observing their own pattern from a position that has some distance
from the pattern itself. They are not simply inside their experience — they are noticing
that they are inside it, or registering the significance of something they just said, or
perceiving themselves in a recurring structure. The Symbolic requires a split — the client
is simultaneously in the material and able to observe themselves in it. This is the
register of meta-awareness, of named contradiction, of recursive self-recognition.

Non-prioritization: No register is therapeutically superior to any other. All three
registers are always available to every client. The therapeutic question is never which
register is better — it is which register is organizing this utterance right now, and
whether the client has genuine access to movement between registers or is fixed in one by
an unresolved trauma dynamic.

Stuckness (0.0-1.0 or null):
If exchangeCount is below 4, return null. There is insufficient register history to
produce a meaningful stuckness score from this few exchanges.
If exchangeCount is 4 or above, score relative to register_history in priorFieldSummary.
0.0 means genuine fluid movement across registers is occurring across the available
history. 1.0 means the client has not moved from one register across all available
exchanges. Score from the history, not from this utterance alone.

Movement: Relative to the prior field assessment, is the client moving toward a different
register, remaining in the same register, or showing the three-register fluidity that
indicates the Symbolic order is live? Return null if no prior assessment exists.


── 2. CONTACT QUALITY ───────────────────────────────────────────────────────

Contact quality describes what the client's utterance is functionally doing in relation
to the connection between themselves and the agent. This is entirely separate from the
content of the utterance. Two utterances with identical content can have entirely
different contact quality depending on what they are functionally doing in the exchange.

PRESENT: The client's speech is oriented toward content. The connection with the agent
is assumed — it is not what the utterance is about or for. The client is bringing
material, not checking whether the space to bring material is still there.

SEEKING_CONFIRMATION: The primary function of this utterance is to verify that the agent
is present and that the contact holds. The client is not primarily communicating content —
the utterance's underlying function is relational verification. This can occur through any
linguistic form: direct relational questions, minimal utterances that function as bids for
response, speech that pauses or trails in a way that is functionally a prompt, and any
other utterance whose primary purpose is to establish that the other is still there and
still present.

WITHDRAWING: The client's speech shows reduced investment in the contact — shorter, more
closed, less engaged than prior turns in a way that suggests movement away from the
connection rather than natural pausing or brevity.

TESTING: The utterance has a probing quality — the client is assessing what the agent
will do, whether the agent can hold something, whether it is safe to go further. Testing
is oriented toward gathering information about the contact before committing more to it.

ABSENT: The client is no longer genuinely in contact — they are producing speech but
the relational engagement has stepped away. Going through motions, surface responses,
speaking as if the agent is not really receiving what is being said.

Contact seeking pattern — assess trajectory across the available conversational history:

ABSENT: No contact-seeking behavior is present in this exchange or visible in history.
ISOLATED: Contact-seeking present in this utterance but not a pattern — appears for the
first time or after a long absence.
RECURRING: Contact-seeking has appeared across the session without temporal clustering —
it is a baseline pattern for this client, distributed across exchanges.
ESCALATING: The frequency of contact-seeking is increasing as the session progresses —
the client is moving toward something and the relational anxiety is rising across turns.
CLUSTERED: Multiple contact-seeking instances in close temporal proximity — several
exchanges in a short span. This indicates acute relational anxiety concentrated at this
specific moment in the session, which is clinically distinct from baseline recurrence.

Escalating and clustered are the clinically significant values. Either one changes what
the session picture surfaces.


── 3. HSFB MODALITY ─────────────────────────────────────────────────────────

Within PCA, experience organizes through four modalities. Identify which is dominant in
this utterance — meaning, which channel is most actively organizing how the client is
processing and expressing their experience right now.

HEARING: The client is primarily organized through internal dialogue, self-talk,
linguistic and narrative structure — what they are saying to themselves, what has been
said, what the words mean.

SEEING: The client's speech is organized around imagery or visual representation — how
things appear, what can be pictured, internal or external visual experience.

FEELING: The client's speech is organized around somatic sensation or emotional
experience — the felt sense, the body's state, physiological experience as it presents
in this moment.

BREATHING: Breathing is directly referenced, or the patterning of the client's speech
suggests a significant breathing state that is organizing the utterance — notably
fragmented, held, rushed, or deliberately paced speech where the breath is the organizing
rhythm.


── 4. IBM ASSESSMENT ────────────────────────────────────────────────────────

The Incoherent Behavior Matrix identifies a specific structural situation: the client
holds a stated or implicit position, and their actual behavior in this conversation
structurally contradicts that position.

Type A: The client is doing something in this conversation that their stated position
says they do not want to do.
Type B: The client is not doing something in this conversation that their stated position
says they want to do.

The stated position may be explicit — something the client has said directly — or
implicit, meaning a position that emerges clearly from the pattern of their speech even
if never stated as a proposition. The position must be derivable from the client's own
words, not inferred from assumptions about what clients generally want.

The contradiction must be between behavior and position — not between two statements the
client has made, and not between the client's affect and their words. IBM is behavioral.
A client who says they do not care and sounds emotional is not an IBM — they are showing
affective-verbal incongruence. An IBM requires a position about what they are doing or
not doing, contradicted by what they are in fact doing or not doing in the exchange.

The IBM accumulates across turns. Use ibm_state from priorFieldSummary to carry
forward the prior contradiction_strength, stated_position, and evidence. Score
contradiction_strength as a running value — what it is now, given everything accumulated
including this utterance. Do not re-derive from this utterance alone.

behavioral_alignment_strength (0.0-1.0): Assess the degree to which the current
utterance disconfirms or confirms the IBM hypothesis.
0.0 means the current utterance strongly disconfirms the contradiction — the client is
clearly acting in alignment with their stated position, which reduces accumulation.
1.0 means the current utterance strongly confirms the contradiction — the behavior
directly and clearly contradicts the stated position again.
0.5 means the utterance is neutral — neither confirming nor disconfirming.

Schema enforcement rule: when contradiction_present is false, type must be null,
hypothesis must be null, and stated_position must be null. When contradiction_present
is true, type must be either "A" or "B" — never null. An LLM generating
contradiction_present: true alongside type: null has produced an inconsistent output.
Do not do this.

Client named: true only if the client has explicitly acknowledged or named the
contradiction themselves in their own speech. This is a significant clinical event —
it represents the client moving into Symbolic register contact with their own IBM.


── 5. CSS SIGNALS ───────────────────────────────────────────────────────────

These are per-utterance signals that accumulate across the session into a session-level
stage assessment at milestone exchanges. They are not verdicts. A single utterance cannot
determine a CSS stage — it can only contribute signal.

Hard confidence ceiling: per-utterance signal confidence must not exceed 0.45 regardless
of how clearly the signal appears in this utterance. Confidence above 0.45 requires
milestone-level evidence accumulated across multiple exchanges, which this assessment
does not have access to. If a signal seems very strong, score it at 0.45 — not higher.
The accumulation logic downstream handles the weighting; your job is per-utterance signal
strength only.

Describe what the client is doing functionally that signals each stage. Describe the
structural situation — do not restate the stage label.

Multiple signals for multiple stages may be present in a single utterance. Omit a stage
entirely if no signal for it is present — do not include stages with confidence 0.0.

POINTED_ORIGIN: The client's speech is organized from within fragmentation without a
stable observer position. The speech does not describe confusion from outside — the
speech is the expression of being inside fragmentation. There is lostness, disorientation,
help-seeking, or the quality of not knowing where the ground is. The client is not yet
able to observe their own situation — they are fully inside it.

FOCUS_BIND: The client is carrying an implicit contradiction that the conversation is
making visible. Both sides of the contradiction are present in the client's speech —
something is being held in place by the contradiction even though the client has not
named or recognized it. The binding is structural: the client is organized around
something they cannot yet see clearly enough to name.

SUSPENSION: The client has reached a liminal state that is distinct from both confusion
and insight. Something is in between — the client has arrived at an edge. The speech has
a quality of waiting, of genuine not-knowing that is held rather than resolved, of being
at a threshold without crossing it. Suspension is not ambivalence and it is not
avoidance — it is the experience of a real opening that has not yet become anything.

GESTURE_TOWARD: Something has shifted in the client's speech that appears to surprise
even the client. A new perspective has emerged that was not constructed — it arrived.
The shift is witnessed rather than built. The client may be uncertain about what they
just said, may qualify it immediately, may seem surprised by their own words. The quality
is of genuine emergence rather than elaboration.

COMPLETION: The client is speaking from a position of integration. What was previously
fragmented, contradicted, or unresolved is now described from the other side — in the
past tense, as something that has resolved, or held without the binding quality it
previously carried. The client is no longer inside the problem in the same way.

TERMINAL: The client is observing themselves in the process of observing — there is
recursive self-awareness in which the client can see the process itself, not only their
experience within it. They are witnessing their own witnessing. Score this conservatively.


── 6. INVESTMENT ────────────────────────────────────────────────────────────

Investment identifies what the client is most drawn toward in this utterance and what
form that investment takes. Investment is not revealed by what the client mentions — it
is revealed by what they move toward without being asked, what they return to across
exchanges, what generates intensity beyond what the surface content warrants, and what
they attempt to name or understand about their own experience.

ELABORATION_WITHOUT_PROMPTING: The client expands on material beyond what any question
or prompt called for.
RETURN_TO_MATERIAL: The client has come back to something mentioned earlier without
being directed to.
EMOTIONAL_DISPROPORTIONALITY: The emotional intensity does not match the surface weight
of what is being discussed — the investment is showing through the gap.
SOMATIC_EMERGENCE: Body experience is arising spontaneously in the midst of narrative —
not described, but erupting into the speech.
NAMING_ATTEMPT: The client is trying to find words for something they do not yet have
language for — reaching toward a description.
REGISTER_SHIFT: The client has moved registers in a way that reveals investment —
particularly a shift from Imaginary toward Real, indicating the material has touched
something the narrative was covering.
NONE: No significant investment signal is present in this utterance.


── 7. CRITICAL MOMENT ───────────────────────────────────────────────────────

A critical moment is a turn in which the field has shifted in a way that warrants
heightened attentiveness from the agent on the next move. It is not a dramatic event —
it is a clinical inflection point.

Mark critical_moment as true when any of the following obtains:

The contact quality has shifted significantly from the prior turn — particularly any
movement toward seeking_confirmation, withdrawing, or absent from a prior state of
present.

A CSS stage signal appears that is meaningfully different from the established cssStage —
particularly any signal toward suspension, gesture_toward, or terminal when the
established stage is pointed_origin or focus_bind.

The client's register has shifted from Imaginary toward Real in a way that opens new
quality of material.

EMOTIONAL_DISPROPORTIONALITY or SOMATIC_EMERGENCE is appearing for the first time or
after absence.

IBM contradiction_strength has increased significantly from the prior ibm_state value.

contact_seeking_pattern has moved to clustered or escalating for the first time.

When critical_moment is false, critical_moment_reason must be null. Do not generate a
reason when the moment is not critical.


─────────────────────────────────────────────────────────────────────────────
OUTPUT
─────────────────────────────────────────────────────────────────────────────

Return ONLY valid JSON. No preamble, no explanation, no markdown fences.
Begin your response with { and end with }.

{
  "register": {
    "current": "Real | Imaginary | Symbolic",
    "functional_description": "one sentence: what the client is functionally doing in this utterance",
    "stuckness": 0.0,
    "movement": "static | toward_real | toward_imaginary | toward_symbolic | fluid | null"
  },
  "contact_quality": {
    "type": "present | seeking_confirmation | withdrawing | testing | absent",
    "contact_seeking_pattern": "absent | isolated | recurring | escalating | clustered",
    "evidence": "one sentence describing what in this utterance and its context produced this assessment"
  },
  "hsfb_dominant": "Hearing | Seeing | Feeling | Breathing",
  "ibm": {
    "contradiction_present": false,
    "type": "A | B | null",
    "hypothesis": "one sentence or null",
    "stated_position": "one sentence or null",
    "contradiction_strength": 0.0,
    "behavioral_alignment_strength": 0.5,
    "client_named": false,
    "evidence": "one sentence describing what in this utterance and its context supports this assessment"
  },
  "css_signals": [
    {
      "stage": "pointed_origin | focus_bind | suspension | gesture_toward | completion | terminal",
      "confidence": 0.35,
      "functional_description": "one sentence: what the client is doing that signals this stage"
    }
  ],
  "investment": {
    "primary_material": "brief description or null",
    "investment_type": "elaboration_without_prompting | return_to_material | emotional_disproportionality | somatic_emergence | naming_attempt | register_shift | none"
  },
  "critical_moment": false,
  "critical_moment_reason": "one sentence or null"
}`;

// ─── LLM Call ─────────────────────────────────────────────────────────────────

/**
 * Run the field assessment LLM call for a single user utterance.
 * Fires in background during agent speech window — zero added latency to user experience.
 * Returns DEFAULT_FIELD_ASSESSMENT on any failure — never throws.
 */
export async function runFieldAssessment(
  input: FieldAssessmentInput,
): Promise<FieldAssessmentOutput> {
  const startTime = Date.now();

  try {
    const conversationText = input.conversationHistory
      .slice(-10)
      .map(m => `${m.role === 'assistant' ? 'Agent' : 'Client'}: ${m.content}`)
      .join('\n');

    const prompt = FIELD_ASSESSMENT_PROMPT
      .replace('{{agentName}}', input.agentName)
      .replace('{{exchangeCount}}', String(input.exchangeCount))
      .replace('{{cssStage}}', input.cssStage || 'unassessed')
      .replace('{{priorFieldSummary}}', input.priorFieldSummary)
      .replace('{{conversationHistory}}', conversationText || 'No prior conversation.')
      .replace('{{utterance}}', input.utterance);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error('🔬 [FieldAssessment] No text block in response');
      return DEFAULT_FIELD_ASSESSMENT;
    }

    let rawText = textBlock.text.trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(rawText) as FieldAssessmentOutput;

    // Enforce schema rule: contradiction_present:true requires type A or B
    if (parsed.ibm.contradiction_present && parsed.ibm.type === null) {
      console.warn('🔬 [FieldAssessment] Schema violation: contradiction_present:true with type:null — correcting');
      parsed.ibm.contradiction_present = false;
    }

    // Enforce confidence ceiling on CSS signals
    if (parsed.css_signals) {
      for (const signal of parsed.css_signals) {
        if (signal.confidence > 0.45) {
          signal.confidence = 0.45;
        }
      }
    }

    // Enforce critical_moment_reason null when not critical
    if (!parsed.critical_moment) {
      parsed.critical_moment_reason = null;
    }

    const elapsed = Date.now() - startTime;
    console.log(`🔬 [FieldAssessment] Completed in ${elapsed}ms — register: ${parsed.register.current}, critical: ${parsed.critical_moment}, css signals: ${parsed.css_signals?.length ?? 0}`);

    return parsed;

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`🔬 [FieldAssessment] Error after ${elapsed}ms:`, error);
    return DEFAULT_FIELD_ASSESSMENT;
  }
}