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

/**
 * Extract user statements from a transcript using role prefix markers.
 * Handles both "User:" / "AI:" prefixed transcripts and plain text fallback.
 */
function extractUserStatements(transcript: string, debug: boolean = false): string[] {
  const userStatements: string[] = [];

  // Role-prefix path: transcript contains "User:" / "AI:" markers
  if (/(?:^|\n)\s*(?:User|AI)\s*:/i.test(transcript)) {
    const lines = transcript.split('\n');
    let currentRole: string | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const roleMatch = line.match(/^\s*(User|AI)\s*:\s*(.*)/i);
      if (roleMatch) {
        // Flush previous accumulation if it was a User turn
        if (currentRole === 'user' && currentContent.length > 0) {
          const text = currentContent.join(' ').trim();
          if (text.length > 10) {
            userStatements.push(text);
            if (debug) console.log(`✅ User turn: "${text.substring(0, 60)}..."`);
          }
        }
        currentRole = roleMatch[1].toLowerCase() === 'user' ? 'user' : 'agent';
        currentContent = roleMatch[2] ? [roleMatch[2].trim()] : [];
      } else if (currentRole) {
        const trimmed = line.trim();
        if (trimmed.length > 0) currentContent.push(trimmed);
      }
    }

    // Flush final turn
    if (currentRole === 'user' && currentContent.length > 0) {
      const text = currentContent.join(' ').trim();
      if (text.length > 10) userStatements.push(text);
    }

    if (debug) console.log(`📝 Role-based extraction: ${userStatements.length} user turns`);
    return userStatements;
  }

  // Fallback: no role markers — return all sentences above minimum length
  if (debug) console.log('📝 No role markers found — using full transcript');
  return transcript
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
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

  const prompt = `You are analyzing client speech from a psychotherapy session transcript to identify Thend — a specific structural event that requires precision to identify correctly.

Thend is NOT: recognizing a contradiction, naming somatic cost, describing exhaustion, or articulating how a bind affects the body. These are valuable clinical moments but they are not Thend.

Thend IS: the client beginning to operate FROM both poles of a contradiction simultaneously — not being caught inside it, but demonstrating the first signs of working from within it. The client has moved from "this bind is happening to me" to showing — through speech or action — that they can hold both sides at once, even briefly.

REQUIRED structural criteria — ALL must be met:
1. A named contradiction (CVDC) must already be present or named in the session — Thend cannot precede CVDC
2. The client is not merely describing the contradiction's effects or costs on them — they are demonstrating movement that requires holding both poles
3. The client's speech or described action shows them operating from inside the mechanism, not observing it from outside
4. The shift is involuntary or surprising to the client — they did not plan to hold both sides, it happened

HARD EXCLUSIONS — if any of these are present, it is NOT Thend:
- Client is describing somatic symptoms of the contradiction (chest tightness, exhaustion, weight)
- Client is narrating how the contradiction functions ("it's easier when there's something to push against")
- Client is expressing resignation or adapted tolerance ("you learn to live with it")
- Client is recognizing that the contradiction serves a function without operating from within that function
- Client ends the passage expressing exhaustion, depletion, or "not quite sure"

CLIENT SPEECH:
"${text.slice(0, 4000)}"

Respond ONLY with valid JSON, no preamble:
{
  "thendMoments": [
    {
      "description": "One sentence describing specifically how the client demonstrated operative movement from within the contradiction — not what they named, but what they did",
      "evidence": "brief quote from the speech showing the moment"
    }
  ]
}

Return an empty array if the criteria are not fully met. When in doubt, return empty. False negatives are preferable to false positives here.`;

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

  const prompt = `You are analyzing client speech from a psychotherapy session transcript to identify CYVC — Constant Yet Variable Conclusion. This requires precision. CYVC is rare and late-stage. It will not appear in early or mid-stage sessions.

CYVC is NOT: recognizing that a contradiction has a structural function, describing behavioral flexibility, noticing that the contradiction serves a purpose, or articulating how the mechanism works. These are observational — they describe the contradiction from outside.

CYVC IS: the client actively attributing value or utility to holding the contradiction — not as an intellectual observation, but as a lived operational position. The client demonstrates they can choose which pole to act from without the act of choosing eliminating the other pole. This is accompanied by a register shift: what previously arrived with distress or exhaustion now arrives with something closer to equanimity, recognition, or even generativity.

REQUIRED structural criteria — ALL must be met:
1. Thend must have already occurred in the clinical history — CYVC cannot precede Thend
2. The client is not merely recognizing that the contradiction is useful — they are operating from that recognition in a way that changes their relationship to the bind
3. The emotional register around the contradiction has shifted — it no longer arrives only with distress, resignation, or exhaustion
4. The client speaks about the mechanism from a position of agency, not depletion

HARD EXCLUSIONS — if any of these are present, it is NOT CYVC:
- Client expresses exhaustion, depletion, or "not quite sure" in the same passage
- Client is describing that the contradiction "makes things easier" as a passive observation
- Client is expressing resignation ("I guess I have to live with it")
- Client is describing the function of the contradiction without demonstrating operative value from holding it
- The surrounding context shows the client is still being acted upon by the contradiction rather than acting from within it

CLIENT SPEECH:
"${text.slice(0, 4000)}"

Respond ONLY with valid JSON, no preamble:
{
  "cyvcMoments": [
    {
      "description": "One sentence describing specifically how the client demonstrated operative value from holding the contradiction — not what they observed, but what they did or chose",
      "evidence": "brief quote from the speech showing the moment"
    }
  ]
}

Return an empty array if the criteria are not fully met. When in doubt, return empty. False negatives are preferable to false positives here.`;

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

  // NOTE: Thend and CYVC detectors are in shadow mode.
  // Their outputs are returned in the CSSPatterns result for logging and arc tracking
  // but do not drive stage determination here until detection precision is validated.
  // Stage is derived from CVDC and IBM signals only.
  if (cvdcCount >= 2 || ibmCount >= 2) {
    return 'suspension';
  }

  if (cvdcCount >= 1 || ibmCount >= 1) {
    return 'focus_bind';
  }

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