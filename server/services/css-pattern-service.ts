// server/services/css-pattern-service.ts
// CSS Pattern Detection Service
// Detects CVDC, IBM, Thend, CYVC patterns in therapeutic conversations

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CSSPatterns {
  cvdcPatterns: string[];
  ibmPatterns: string[];
  thendIndicators: string[];
  cyvcPatterns: string[];
  currentStage: string;
}

export type CSSStage = 'pointed_origin' | 'focus_bind' | 'suspension' | 'gesture_toward' | 'completion' | 'terminal';

// Agent response markers to filter out
const AGENT_MARKERS = [
  /What\'s it like/gi,
  /Can you tell me more/gi,
  /How does that feel/gi,
  /I hear you saying/gi,
  /It sounds like/gi,
  /What do you notice/gi,
  /I\'m curious about/gi,
  /Thank you for sharing/gi,
  /That must be/gi,
  /I can imagine/gi
];

/**
 * Extract user statements from a full transcript
 */
function extractUserStatements(transcript: string, debug: boolean = false): string[] {
  // Split by sentences but preserve the full text structure
  const sentences = transcript
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (debug) {
    console.log(`📝 Split into ${sentences.length} sentences`);
  }

  const userStatements: string[] = [];

  for (const sentence of sentences) {
    // Skip if it's likely an agent response
    const isAgentResponse = AGENT_MARKERS.some(marker =>
      marker.test(sentence)
    );

    // Skip questions (likely agent) - but not all questions
    const isQuestion = sentence.trim().endsWith('?') && !sentence.includes('I');

    // Prefer statements starting with "I" (likely user)
    const startsWithI = /^I\s/i.test(sentence.trim());

    // Include if it seems like a user statement
    if (!isAgentResponse && (!isQuestion || startsWithI)) {
      userStatements.push(sentence.trim());
      if (debug) console.log(`✅ User statement: "${sentence.substring(0, 50)}..."`);
    } else if (debug) {
      console.log(`❌ Filtered out: "${sentence.substring(0, 50)}..." (agent:${isAgentResponse}, question:${isQuestion})`);
    }
  }

  if (debug) {
    console.log(`📝 Extracted ${userStatements.length} user statements from ${sentences.length} sentences`);
  }

  return userStatements;
}

/**
 * Detect CVDC and IBM patterns using semantic LLM analysis.
 * Replaces keyword regex detection with structural situation assessment.
 */
async function detectClinicalPatternsWithLLM(userText: string): Promise<{ cvdcPatterns: string[]; ibmPatterns: string[] }> {
  try {
    const response = await (anthropic as any).messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are analyzing a therapeutic conversation transcript to identify two specific clinical patterns.

CLIENT SPEECH (extracted from session):
"${userText.slice(0, 4000)}"

CVDC (Constant Variably Determined Contradiction): Identify any instances where the client holds a position, belief, or stated reality, AND their own speech simultaneously contains material that contradicts or destabilizes that position from within. This is not the client saying "I feel two things" — it is a structural situation where the speech carries both the claim and the evidence against it. The client does not need to acknowledge the contradiction.

IBM (Incoherent Behavior Matrix): Identify any instances where the client's speech reveals a gap between what they have stated they want, believe, or intend to do — AND what they are actually doing in this conversation or in the behaviors they describe. The stated position may be explicit or implicit from the pattern of their speech. The behavioral contradiction must be derivable from the client's own words.

Return ONLY valid JSON, no preamble:
{
  "cvdc": [
    { "description": "one sentence describing the structural contradiction", "evidence": "brief quote from transcript" }
  ],
  "ibm": [
    { "description": "one sentence describing the position/behavior gap", "evidence": "brief quote from transcript" }
  ]
}
Return empty arrays if no instances are present. Do not invent patterns that are not clearly present.`
      }],
    });

    const textBlock = response.content.find((b: any) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      console.error('🔬 [CSSPatterns] No text block in LLM response');
      return { cvdcPatterns: [], ibmPatterns: [] };
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('🔬 [CSSPatterns] No JSON object found in LLM response');
      return { cvdcPatterns: [], ibmPatterns: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const cvdcPatterns = Array.isArray(parsed.cvdc)
      ? parsed.cvdc.map((item: any) => item.description || '').filter((d: string) => d.length > 0)
      : [];

    const ibmPatterns = Array.isArray(parsed.ibm)
      ? parsed.ibm.map((item: any) => item.description || '').filter((d: string) => d.length > 0)
      : [];

    return { cvdcPatterns, ibmPatterns };
  } catch (error) {
    console.error('🔬 [CSSPatterns] LLM detection error:', error);
    return { cvdcPatterns: [], ibmPatterns: [] };
  }
}

/**
 * Detects CSS patterns in therapeutic conversation transcript
 */
export async function detectCSSPatterns(transcript: string, debug: boolean = false): Promise<CSSPatterns> {
  if (!transcript || transcript.trim().length === 0) {
    console.log('⚠️ Empty transcript provided to detectCSSPatterns');
    return {
      cvdcPatterns: [],
      ibmPatterns: [],
      thendIndicators: [],
      cyvcPatterns: [],
      currentStage: 'pointed_origin'
    };
  }

  if (debug) {
    console.log('🔍 Starting CSS pattern detection');
    console.log('📝 Transcript preview:', transcript.substring(0, 150) + '...');
  }

  // Extract user statements (or use full transcript)
  const userStatements = extractUserStatements(transcript, debug);
  const userText = userStatements.join(' ');

  // Also scan full transcript as fallback
  const textToAnalyze = userText || transcript;

  const { cvdcPatterns: cvdcMatches, ibmPatterns: ibmMatches } = await detectClinicalPatternsWithLLM(textToAnalyze);
  const thendIndicators = await detectThend(textToAnalyze);
  const cyvcPatterns = await detectCYVC(textToAnalyze);

  const currentStage = determineStage(cvdcMatches, ibmMatches, thendIndicators, cyvcPatterns);

  if (debug) {
    console.log(`📊 Pattern Detection Results:
    - CVDC: ${cvdcMatches.length} patterns
    - IBM: ${ibmMatches.length} patterns
    - Thend: ${thendIndicators.length} indicators
    - CYVC: ${cyvcPatterns.length} patterns
    - Stage: ${currentStage}`);
  }

  return {
    cvdcPatterns: cvdcMatches,
    ibmPatterns: ibmMatches,
    thendIndicators: thendIndicators,
    cyvcPatterns: cyvcPatterns,
    currentStage: currentStage
  };
}

async function detectThend(text: string): Promise<string[]> {
  if (!text || text.trim().length < 50 || !process.env.ANTHROPIC_API_KEY) {
    return [];
  }

  const prompt = `You are analyzing client speech from a psychotherapy session transcript to identify Thend — a specific structural event, not a lexical pattern.

Thend is a register event: the client is in narrative or explanatory speech (Imaginary or Symbolic register) and Real-register material — body sensation, involuntary affect, or somatic experience — breaks through in a way the client did not initiate or anticipate.

CLIENT SPEECH:
"${text.slice(0, 4000)}"

Identify moments that meet ALL of the following structural criteria:
1. The client was engaged in narrative, explanation, or contextualization — not in somatic inquiry
2. A body sensation, physical location, tightness, pressure, temperature, or involuntary affective quality entered the speech spontaneously — without being prompted
3. The emotional or somatic material that arrived does not match the valence or intensity of the narrative the client was producing (affective disproportionality), OR the client appears surprised by what they said or felt
4. The material that arrived is new — the client was not already tracking it as part of their narrative

Do NOT identify:
- Retrospective accounts of past insight ("it clicked last week", "I realized later")
- Cognitive interpretations or summaries ("I understand now that...")
- Emotional expression the client was already narrating or tracking
- Neat insight statements — Thend is not insight, it is register arrival

Respond ONLY with valid JSON, no preamble:
{
  "thendMoments": [
    {
      "description": "One sentence describing what broke through and how",
      "evidence": "brief quote from the speech showing the moment"
    }
  ]
}

Return an empty array if no moments meet the full structural criteria. Do not lower the bar.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });

    const textBlock = response.content.find((b: any) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed.thendMoments)
      ? parsed.thendMoments
          .filter((m: any) => m.description && m.description.length > 0)
          .map((m: any) => m.description as string)
      : [];
  } catch (error) {
    console.error('🔬 [CSSPatterns] Thend detection error:', error);
    return [];
  }
}

async function detectCYVC(text: string): Promise<string[]> {
  if (!text || text.trim().length < 50 || !process.env.ANTHROPIC_API_KEY) {
    return [];
  }

  const prompt = `You are analyzing client speech from a psychotherapy session transcript to identify CYVC — Constant Yet Variable Conclusion. This is a specific structural state, not behavioral flexibility or situational adaptation.

CYVC is operative simultaneity: the client holds both sides of a contradiction simultaneously and acts from a chosen position within that holding — without either side eliminating the choice, and without the presence of the other side preventing action. The contradiction has not resolved — both values or desires are still present — but the client is no longer tormented by the paradox. They inhabit it as a generative principle.

CLIENT SPEECH:
"${text.slice(0, 4000)}"

Identify moments that meet the structural criteria of CYVC:
1. The client names or implies both sides of a contradiction simultaneously — not alternating between them ("sometimes X, sometimes Y") but holding them at once
2. The client speaks from a position of chosen action within that holding — not from exhaustion, resignation, or one side winning
3. The client's relationship to the contradiction has changed in register: what previously came with distress now comes with recognition, observation, or even equanimity
4. OR: the client begins to transmit the integration outward — they speak about someone else's stuck contradiction using language that implies they have already metabolized their own

Do NOT identify:
- Behavioral flexibility or situational adaptation ("I do different things in different contexts")
- Resignation ("I guess I have to live with it")
- One side of the contradiction suppressing the other
- Cognitive inventory-taking ("I have options", "it depends")
- Reported flexibility without evidence of the contradiction still being held

Respond ONLY with valid JSON, no preamble:
{
  "cyvcMoments": [
    {
      "description": "One sentence describing the operative simultaneity and what the client is doing",
      "evidence": "brief quote from the speech showing the moment"
    }
  ]
}

Return an empty array if no moments meet the full structural criteria. Do not lower the bar.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    });

    const textBlock = response.content.find((b: any) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed.cyvcMoments)
      ? parsed.cyvcMoments
          .filter((m: any) => m.description && m.description.length > 0)
          .map((m: any) => m.description as string)
      : [];
  } catch (error) {
    console.error('🔬 [CSSPatterns] CYVC detection error:', error);
    return [];
  }
}

/**
 * Determine CSS stage based on detected patterns
 */
function determineStage(
  cvdcPatterns: string[],
  ibmPatterns: string[],
  thendIndicators: string[],
  cyvcPatterns: string[]
): string {
  const cvdcCount = cvdcPatterns.length;
  const ibmCount = ibmPatterns.length;
  const thendCount = thendIndicators.length;
  const cyvcCount = cyvcPatterns.length;

  // Terminal: Full recursive awareness with contextual flexibility
  if (cyvcCount >= 2 && thendCount >= 1) {
    return 'terminal';
  }

  // Completion: Active choice and flexibility
  if (cyvcCount >= 1) {
    return 'completion';
  }

  // Gesture toward: Integration beginning
  if (thendCount >= 2) {
    return 'gesture_toward';
  }

  if (thendCount > 0) {
    // Suspension to Gesture toward: Pure integration moments
    return 'suspension';
  }

  if (cvdcCount >= 2 || ibmCount >= 2) {
    // Suspension: Multiple contradictions held
    return 'suspension';
  }

  if (cvdcCount >= 1 || ibmCount >= 1) {
    // Focus bind: Clear contradiction identified
    return 'focus_bind';
  }

  // Pointed origin: Default/starting stage
  return 'pointed_origin';
}

/**
 * Analyzes pattern progression and confidence scoring
 */
export function assessPatternConfidence(patterns: CSSPatterns): {
  confidence: number;
  reasoning: string;
} {
  const totalPatterns = patterns.cvdcPatterns.length +
                       patterns.ibmPatterns.length +
                       patterns.thendIndicators.length +
                       patterns.cyvcPatterns.length;

  if (totalPatterns === 0) {
    return {
      confidence: 0.3,
      reasoning: 'No clear CSS patterns detected in transcript'
    };
  }

  if (totalPatterns >= 5) {
    return {
      confidence: 0.95,
      reasoning: `Very strong evidence with ${totalPatterns} pattern matches`
    };
  }

  if (totalPatterns >= 3) {
    return {
      confidence: 0.85,
      reasoning: `Strong evidence with ${totalPatterns} pattern matches`
    };
  }

  if (totalPatterns >= 2) {
    return {
      confidence: 0.7,
      reasoning: `Moderate evidence with ${totalPatterns} pattern matches`
    };
  }

  return {
    confidence: 0.5,
    reasoning: `Limited evidence with ${totalPatterns} pattern match`
  };
}