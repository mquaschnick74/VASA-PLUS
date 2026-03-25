// server/services/sensing-layer/pattern-detection.ts
// Pattern Detection module for the Sensing Layer

import {
  TurnInput,
  UserTherapeuticProfile,
  PatternDetectionResult,
  DetectedPattern,
  EmergingPattern,
  PatternResonance,
  UserExplicitPattern,
  PatternType,
  UserPattern,
  IBMDetectionResult
} from './types';

/**
 * Detect patterns semantically using LLM
 * Works even without existing profile patterns
 */
async function detectSemanticPatternsWithLLM(
  input: TurnInput
): Promise<{
  patterns: DetectedPattern[];
  emerging: EmergingPattern[];
  explicitIdentification: UserExplicitPattern | null;
}> {
  // Only run for substantial utterances
  if (input.utterance.length < 30 || !process.env.ANTHROPIC_API_KEY) {
    return { patterns: [], emerging: [], explicitIdentification: null };
  }

  const recentContext = input.conversationHistory
    .slice(-4)
    .map(m => `${m.role}: ${m.content.slice(0, 100)}`)
    .join('\n');

  // FIX: Raised confidence threshold from > 0.4 to > 0.6.
  // Patterns with confidence < 0.6 are single-utterance surface observations —
  // not clinically meaningful.
  //
  // FIX: Explicit instruction to describe only the USER's psychological patterns,
  // not the therapist's interventions or the assistant's behaviors.
  // Previously the LLM was generating descriptions like "The assistant expresses
  // a need for confirmation..." because the prompt did not exclude agent content.
  const prompt = `Analyze this therapeutic conversation for the USER's psychological patterns.

CURRENT USER UTTERANCE: "${input.utterance}"

RECENT CONTEXT (user turns only are clinically relevant):
${recentContext || 'First utterance'}

CRITICAL RULES:
- Describe only the USER's patterns — never the therapist's interventions or the assistant's behaviors.
- A pattern requires behavioral or emotional evidence from the USER's own words.
- Do not infer patterns from what the assistant said or did.
- Patterns must be concise (under 15 words), specific, and grounded in depth psychology.

Identify from the USER's utterance:
1. CVDC Contradictions (user wants X but does Y, says one thing but feels another)
2. Emotional patterns (recurring feelings or reactions the user describes)
3. Behavioral patterns (repeated actions or choices the user describes)
4. Relational patterns (dynamics with others the user describes)
5. Self-awareness statements where the user explicitly recognizes a pattern in themselves

Respond in JSON:
{
  "explicitPattern": {
    "statement": "exact quote where user recognizes a pattern in themselves",
    "inferredPattern": "the pattern they are recognizing",
    "confidence": 0.0-1.0
  } OR null,
  "detectedPatterns": [
    {
      "description": "concise user pattern description (under 15 words)",
      "type": "behavioral|cognitive|relational|emotional|avoidance|protective",
      "confidence": 0.0-1.0,
      "evidence": "user quote supporting this"
    }
  ],
  "emergingPatterns": [
    {
      "description": "emerging user pattern (under 15 words)",
      "type": "behavioral|cognitive|relational|emotional|avoidance|protective",
      "significance": "why this matters therapeutically for this user"
    }
  ]
}

Only include patterns with confidence > 0.6. Focus on depth psychology. Be concise.`;

  try {
    const anthropic = await import('@anthropic-ai/sdk');
    const client = new anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { patterns: [], emerging: [], explicitIdentification: null };
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { patterns: [], emerging: [], explicitIdentification: null };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('🔍 [LLM Pattern Detection] JSON parse failed. Raw response:', content.text.slice(0, 500));
      return { patterns: [], emerging: [], explicitIdentification: null };
    }

    const patterns: DetectedPattern[] = (parsed.detectedPatterns || []).map((p: any, idx: number) => ({
      patternId: `llm-detected-${Date.now()}-${idx}`,
      description: p.description || '',
      patternType: validatePatternType(p.type),
      matchConfidence: Math.min(1, Math.max(0, p.confidence || 0.5)),
      utteranceEvidence: p.evidence || input.utterance.slice(0, 100),
      occurrenceCount: 1
    }));

    const emerging: EmergingPattern[] = (parsed.emergingPatterns || []).map((p: any) => ({
      description: p.description || '',
      patternType: validatePatternType(p.type),
      occurrenceCount: 1,
      examples: [input.utterance.slice(0, 100)],
      potentialSignificance: p.significance || 'Emerging pattern detected'
    }));

    const explicitIdentification = parsed.explicitPattern ? {
      statement: parsed.explicitPattern.statement || '',
      inferredPattern: parsed.explicitPattern.inferredPattern || '',
      confidence: Math.min(1, Math.max(0, parsed.explicitPattern.confidence || 0.7))
    } : null;

    console.log(`🔍 [LLM Pattern Detection] Found ${patterns.length} patterns, ${emerging.length} emerging`);

    return { patterns, emerging, explicitIdentification };
  } catch (error) {
    console.error('🔍 [LLM Pattern Detection] Error:', error);
    return { patterns: [], emerging: [], explicitIdentification: null };
  }
}

function validatePatternType(type: string): PatternType {
  const valid: PatternType[] = ['behavioral', 'cognitive', 'relational', 'emotional', 'avoidance', 'protective'];
  const normalized = type?.toLowerCase() as PatternType;
  return valid.includes(normalized) ? normalized : 'emotional';
}

/**
 * Detect patterns in the current utterance against the user's therapeutic profile
 */
export async function detectPatterns(
  input: TurnInput,
  profile: UserTherapeuticProfile
): Promise<PatternDetectionResult> {
  console.log(`🔍 [Pattern Detection] Processing utterance for user: ${input.userId}`);

  const utteranceLower = input.utterance.toLowerCase();

  // 1. LLM-based semantic detection (works without existing profile)
  const llmResults = await detectSemanticPatternsWithLLM(input);

  // 2. Check for user explicitly identifying a pattern
  const userExplicitIdentification = llmResults.explicitIdentification;

  // 3. Match against existing patterns (only if profile has patterns)
  const profileMatches = profile.patterns.length > 0
    ? matchExistingPatterns(input, profile.patterns)
    : [];

  // 4. Detect emerging patterns from conversation history (semantic LLM assessment)
  const semanticEmerging = await detectEmergingPatterns(input, profile.patterns);

  // 5. Merge LLM and keyword-based results (remove duplicates)
  const activePatterns = mergePatternsDedup([...llmResults.patterns, ...profileMatches]);
  const emergingPatterns = mergePatternsDedup([...llmResults.emerging, ...semanticEmerging]);

  // 6. Calculate pattern resonance
  const patternResonance = calculatePatternResonance(input, profile.patterns);

  console.log(`🔍 [Pattern Detection] Found: ${activePatterns.length} active (${llmResults.patterns.length} from LLM), ${emergingPatterns.length} emerging`);

  return {
    activePatterns,
    emergingPatterns,
    patternResonance,
    userExplicitIdentification
  };
}

/**
 * Merge and deduplicate patterns based on description similarity
 */
function mergePatternsDedup<T extends { description: string }>(patterns: T[]): T[] {
  const merged: T[] = [];

  for (const pattern of patterns) {
    const isDuplicate = merged.some(existing => {
      const similarity = calculateSimilarity(
        pattern.description.toLowerCase(),
        existing.description.toLowerCase()
      );
      return similarity > 0.6;
    });

    if (!isDuplicate) {
      merged.push(pattern);
    }
  }

  return merged;
}

function matchExistingPatterns(
  input: TurnInput,
  existingPatterns: UserPattern[]
): DetectedPattern[] {
  const matched: DetectedPattern[] = [];
  const utteranceLower = input.utterance.toLowerCase();

  for (const pattern of existingPatterns) {
    if (!pattern.active) continue;

    const matchResult = calculatePatternMatch(utteranceLower, pattern);

    if (matchResult.confidence > 0.4) {
      matched.push({
        patternId: pattern.id,
        description: pattern.description,
        patternType: pattern.patternType,
        matchConfidence: matchResult.confidence,
        utteranceEvidence: matchResult.evidence,
        occurrenceCount: pattern.occurrences
      });
    }
  }

  return matched.sort((a, b) => b.matchConfidence - a.matchConfidence);
}

function calculatePatternMatch(
  utteranceLower: string,
  pattern: UserPattern
): { confidence: number; evidence: string } {
  let confidence = 0;
  let evidence = '';

  const patternKeywords = extractKeywords(pattern.description);
  let keywordMatches = 0;

  for (const keyword of patternKeywords) {
    if (utteranceLower.includes(keyword.toLowerCase())) {
      keywordMatches++;
      evidence = keyword;
    }
  }

  if (patternKeywords.length > 0) {
    confidence += (keywordMatches / patternKeywords.length) * 0.4;
  }

  for (const example of pattern.examples) {
    const similarity = calculateSimilarity(utteranceLower, example.toLowerCase());
    if (similarity > 0.3) {
      confidence += similarity * 0.3;
      evidence = example.substring(0, 50);
      break;
    }
  }

  const thematicMatch = matchPatternType(utteranceLower, pattern.patternType);
  if (thematicMatch > 0) {
    confidence += thematicMatch * 0.3;
  }

  return { confidence: Math.min(confidence, 1), evidence };
}

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'i', 'me', 'my', 'myself', 'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are',
    'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about',
    'into', 'over', 'after', 'it', 'its', 'this', 'that', 'these', 'those',
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then'
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
}

function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(extractKeywords(text1));
  const words2 = new Set(extractKeywords(text2));

  if (words1.size === 0 || words2.size === 0) return 0;

  let overlap = 0;
  for (const word of Array.from(words1)) {
    if (words2.has(word)) overlap++;
  }

  return (2 * overlap) / (words1.size + words2.size);
}

function matchPatternType(utteranceLower: string, patternType: PatternType): number {
  const typeIndicators: Record<PatternType, string[]> = {
    behavioral: ['do', 'act', 'behavior', 'action', 'habit', 'routine', 'reaction'],
    cognitive: ['think', 'thought', 'believe', 'mind', 'idea', 'worry', 'ruminate'],
    relational: ['relationship', 'partner', 'friend', 'family', 'people', 'connect', 'trust'],
    emotional: ['feel', 'feeling', 'emotion', 'sad', 'angry', 'anxious', 'happy', 'afraid'],
    avoidance: ['avoid', 'escape', 'ignore', 'hide', 'run', 'away', 'distance', 'numb'],
    protective: ['protect', 'safe', 'defend', 'guard', 'wall', 'barrier', 'control']
  };

  const indicators = typeIndicators[patternType] || [];
  let matches = 0;

  for (const indicator of indicators) {
    if (utteranceLower.includes(indicator)) matches++;
  }

  return indicators.length > 0 ? matches / indicators.length : 0;
}

async function detectEmergingPatterns(
  input: TurnInput,
  existingPatterns: UserPattern[]
): Promise<EmergingPattern[]> {
  const userUtterances = input.conversationHistory
    .filter(turn => turn.role === 'user')
    .map(turn => turn.content);
  userUtterances.push(input.utterance);

  if (userUtterances.length < 2 || !process.env.ANTHROPIC_API_KEY) {
    return [];
  }

  const existingDescriptions = existingPatterns.length > 0
    ? existingPatterns.map(p => p.description).join('; ')
    : 'None established yet';

  const conversationText = userUtterances
    .map((u, i) => `[${i + 1}] ${u}`)
    .join('\n');

  const prompt = `You are analyzing a therapeutic conversation to identify psychological themes that are structurally emerging across multiple user utterances.

USER UTTERANCES FROM THIS SESSION (chronological):
${conversationText}

ALREADY ESTABLISHED PATTERNS FOR THIS CLIENT:
${existingDescriptions}

Your task: Identify themes that appear to be emerging — meaning they show up across more than one utterance, not just the most recent one. A theme qualifies as emerging only if there is structural or behavioral evidence for it across multiple utterances. You are looking for structural situations, not surface-level word repetition.

Do not identify:
- Anything already covered by the established patterns listed above
- Themes present in only a single utterance
- Themes derived from the therapist's speech (user utterances only)
- Themes inferred from word frequency alone — there must be structural evidence

A valid emerging theme describes what the client is doing psychologically across multiple moments — a relational position, a behavioral pattern, an avoidance strategy, a cognitive stance — derivable from the client's own words and not from labels or categories you are imposing.

Respond ONLY with valid JSON, no preamble:
{
  "emergingThemes": [
    {
      "description": "Concise description of what the client is doing psychologically (under 15 words)",
      "patternType": "behavioral|cognitive|relational|emotional|avoidance|protective",
      "occurrenceCount": number of utterances where this is evidenced,
      "examples": ["brief quote or paraphrase from utterance 1", "brief quote from utterance 2"],
      "potentialSignificance": "one sentence on why this matters therapeutically"
    }
  ]
}

Return an empty array if no themes meet the standard. Do not invent patterns.`;

  try {
    const anthropic = await import('@anthropic-ai/sdk');
    const client = new anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type !== 'text') return [];

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }

    return (parsed.emergingThemes || []).map((t: any) => ({
      description: t.description || '',
      patternType: validatePatternType(t.patternType),
      occurrenceCount: Math.max(2, t.occurrenceCount || 2),
      examples: Array.isArray(t.examples) ? t.examples.slice(0, 3) : [],
      potentialSignificance: t.potentialSignificance || ''
    })).filter((t: EmergingPattern) => t.description.length > 0);

  } catch (error) {
    console.error('🔍 [Emerging Pattern Detection] Error:', error);
    return [];
  }
}

function calculatePatternResonance(
  input: TurnInput,
  patterns: UserPattern[]
): PatternResonance[] {
  const resonances: PatternResonance[] = [];
  const utteranceLower = input.utterance.toLowerCase();

  for (const pattern of patterns) {
    if (!pattern.active) continue;

    const directResonance = calculateDirectResonance(utteranceLower, pattern);
    const thematicResonance = calculateThematicResonance(utteranceLower, pattern);
    const emotionalResonance = calculateEmotionalResonance(utteranceLower, pattern);
    const structuralResonance = calculateStructuralResonance(input.utterance, pattern);

    const resonanceTypes = [
      { type: 'direct' as const, strength: directResonance },
      { type: 'thematic' as const, strength: thematicResonance },
      { type: 'emotional' as const, strength: emotionalResonance },
      { type: 'structural' as const, strength: structuralResonance }
    ];

    const strongest = resonanceTypes.reduce((a, b) => a.strength > b.strength ? a : b);

    if (strongest.strength > 0.2) {
      resonances.push({
        patternId: pattern.id,
        resonanceStrength: strongest.strength,
        resonanceType: strongest.type
      });
    }
  }

  return resonances.sort((a, b) => b.resonanceStrength - a.resonanceStrength);
}

function calculateDirectResonance(utterance: string, pattern: UserPattern): number {
  const patternWords = extractKeywords(pattern.description);
  let matches = 0;

  for (const word of patternWords) {
    if (utterance.includes(word)) matches++;
  }

  return patternWords.length > 0 ? matches / patternWords.length : 0;
}

function calculateThematicResonance(utterance: string, pattern: UserPattern): number {
  return matchPatternType(utterance, pattern.patternType);
}

function calculateEmotionalResonance(utterance: string, pattern: UserPattern): number {
  const emotionWords = [
    'feel', 'feeling', 'felt', 'emotion', 'heart', 'gut',
    'scared', 'afraid', 'anxious', 'worried', 'nervous',
    'angry', 'furious', 'frustrated', 'annoyed', 'irritated',
    'sad', 'depressed', 'down', 'hopeless', 'empty',
    'happy', 'joy', 'excited', 'hopeful', 'peaceful',
    'ashamed', 'guilty', 'embarrassed', 'humiliated'
  ];

  const patternWords = pattern.description.toLowerCase().split(/\s+/);
  const utteranceWords = utterance.split(/\s+/);

  let patternEmotionCount = 0;
  let utteranceEmotionCount = 0;

  for (const word of emotionWords) {
    if (patternWords.some(w => w.includes(word))) patternEmotionCount++;
    if (utteranceWords.some(w => w.includes(word))) utteranceEmotionCount++;
  }

  if (patternEmotionCount === 0 || utteranceEmotionCount === 0) return 0;

  return Math.min(patternEmotionCount, utteranceEmotionCount) / Math.max(patternEmotionCount, utteranceEmotionCount);
}

function calculateStructuralResonance(utterance: string, pattern: UserPattern): number {
  const structures = {
    'I always': /i always/i,
    'I never': /i never/i,
    'When...then': /when.{5,30}then/i,
    'If...would': /if.{5,30}would/i,
    'Part of me': /part of me/i,
    'I want...but': /i want.{5,30}but/i,
    'I should...but': /i should.{5,30}but/i
  };

  let patternStructures = 0;
  let utteranceStructures = 0;
  let matchingStructures = 0;

  for (const [_, regex] of Object.entries(structures)) {
    const inPattern = regex.test(pattern.description);
    const inUtterance = regex.test(utterance);

    if (inPattern) patternStructures++;
    if (inUtterance) utteranceStructures++;
    if (inPattern && inUtterance) matchingStructures++;
  }

  if (patternStructures === 0 || utteranceStructures === 0) return 0;

  return matchingStructures / Math.max(patternStructures, utteranceStructures);
}

export async function detectIBMWithLLM(input: TurnInput): Promise<IBMDetectionResult> {
  const defaultResult: IBMDetectionResult = {
    hypothesis: null,
    statedPosition: null,
    contradictionStrength: 0,
    behavioralAlignment: false,
    clientNamed: false,
    evidence: ''
  };
  if (!process.env.ANTHROPIC_API_KEY || input.utterance.length < 20) {
    return defaultResult;
  }
  const recentHistory = input.conversationHistory
    .slice(-6)
    .map(t => `${t.role.toUpperCase()}: ${t.content}`)
    .join('\n');
  const prompt = `Analyze this therapeutic conversation for an Incoherent Behavior Matrix (IBM) pattern.
An IBM occurs when a client's stated reason or position is structurally contradicted by their actual behavior in the conversation. Example: client says "I'm only here because I agreed to be" but then actively engages, pushes back, and corrects the therapist across multiple turns.
RECENT CONVERSATION HISTORY:
${recentHistory || 'No prior history'}
CURRENT UTTERANCE:
"${input.utterance}"
Assess:
1. Has the client stated a position or reason (for being here, for their behavior, for their feelings) in the conversation history?
2. Does the current utterance behaviorally contradict that stated position, or does it align with it?
3. Has the client explicitly named the contradiction themselves?
Respond ONLY with valid JSON:
{
  "hypothesis": "one sentence describing the contradiction, or null if none",
  "statedPosition": "the client's stated position verbatim or paraphrased, or null",
  "contradictionStrength": 0.0,
  "behavioralAlignment": false,
  "clientNamed": false,
  "evidence": "what in the current utterance supports this assessment"
}
contradictionStrength: 0 = no contradiction or alignment turn, 0.1-0.4 = mild inconsistency, 0.5-0.7 = clear behavioral contradiction, 0.8-1.0 = direct and explicit contradiction of stated position.
behavioralAlignment: true only if current utterance actively confirms the stated position.
clientNamed: true only if the client explicitly acknowledges or names the contradiction themselves.`;
  try {
    const anthropic = await import('@anthropic-ai/sdk');
    const client = new anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    const content = response.content[0];
    if (content.type !== 'text') return defaultResult;
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return defaultResult;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      hypothesis: parsed.hypothesis || null,
      statedPosition: parsed.statedPosition || null,
      contradictionStrength: Math.min(1, Math.max(0, parsed.contradictionStrength || 0)),
      behavioralAlignment: parsed.behavioralAlignment || false,
      clientNamed: parsed.clientNamed || false,
      evidence: parsed.evidence || ''
    };
  } catch {
    return defaultResult;
  }
}