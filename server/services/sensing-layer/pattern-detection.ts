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

  const prompt = `Analyze this therapeutic conversation for psychological patterns.

CURRENT UTTERANCE: "${input.utterance}"

RECENT CONTEXT:
${recentContext || 'First utterance'}

Identify:
1. CVDC Contradictions (wanting X but doing Y, saying one thing but feeling another)
2. Emotional patterns (recurring feelings, reactions)
3. Behavioral patterns (repeated actions, choices)
4. Relational patterns (dynamics with others)
5. Self-awareness statements ("I notice I...", "I always...", pattern recognition)

Respond in JSON:
{
  "explicitPattern": {
    "statement": "exact quote where they recognize a pattern",
    "inferredPattern": "the pattern they're recognizing",
    "confidence": 0.0-1.0
  } OR null,
  "detectedPatterns": [
    {
      "description": "concise pattern description",
      "type": "behavioral|cognitive|relational|emotional|avoidance|protective",
      "confidence": 0.0-1.0,
      "evidence": "quote supporting this"
    }
  ],
  "emergingPatterns": [
    {
      "description": "pattern appearing but not fully formed",
      "type": "behavioral|cognitive|relational|emotional|avoidance|protective",
      "significance": "why this matters therapeutically"
    }
  ]
}

Be concise. Only include patterns with confidence > 0.4. Focus on depth psychology, not surface observations.`;

  try {
    const anthropic = await import('@anthropic-ai/sdk');
    const client = new anthropic.default({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1200,
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

  // 2. Check for user explicitly identifying a pattern (keyword-based)
  const keywordExplicitIdentification = detectUserExplicitPattern(input.utterance);

  // Merge explicit identifications (LLM takes priority if both exist)
  const userExplicitIdentification = llmResults.explicitIdentification || keywordExplicitIdentification;

  // 3. Match against existing patterns (only if profile has patterns)
  const profileMatches = profile.patterns.length > 0
    ? matchExistingPatterns(input, profile.patterns)
    : [];

  // 4. Detect emerging patterns from conversation history (keyword-based)
  const keywordEmerging = detectEmergingPatterns(input, profile.patterns);

  // 5. Merge LLM and keyword-based results (remove duplicates)
  const activePatterns = mergePatternsDedup([...llmResults.patterns, ...profileMatches]);
  const emergingPatterns = mergePatternsDedup([...llmResults.emerging, ...keywordEmerging]);

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
      return similarity > 0.6; // 60% similar = duplicate
    });

    if (!isDuplicate) {
      merged.push(pattern);
    }
  }

  return merged;
}

/**
 * Detect when user explicitly identifies their own pattern
 * e.g., "I always do this", "this is a problem for me", "I notice I..."
 */
function detectUserExplicitPattern(utterance: string): UserExplicitPattern | null {
  const lowerUtterance = utterance.toLowerCase();

  const explicitPatternMarkers = [
    // Direct identification
    { regex: /i always (do|feel|think|say|end up|find myself)/i, type: 'always' },
    { regex: /i never (seem to|can|manage to|let myself)/i, type: 'never' },
    { regex: /this is a pattern/i, type: 'direct' },
    { regex: /i (notice|realize|see) (that )?i (always|tend to|keep)/i, type: 'insight' },

    // Problem identification
    { regex: /this is (my|a) problem/i, type: 'problem' },
    { regex: /i know i (shouldn't|should|need to) but/i, type: 'awareness' },
    { regex: /i keep doing (this|the same thing)/i, type: 'repetition' },
    { regex: /every time.{0,30}(i|the same thing happens)/i, type: 'repetition' },

    // Pattern language
    { regex: /i have (this|a) (habit|tendency|pattern) of/i, type: 'labeled' },
    { regex: /i'm (stuck|trapped) in/i, type: 'stuck' },
    { regex: /i can't (stop|help|break)/i, type: 'compulsive' }
  ];

  for (const marker of explicitPatternMarkers) {
    const match = utterance.match(marker.regex);
    if (match) {
      // Extract the pattern context (what comes after the marker)
      const markerEnd = match.index! + match[0].length;
      const patternContext = utterance.substring(markerEnd, markerEnd + 100).trim();

      return {
        statement: match[0],
        inferredPattern: patternContext || extractPatternFromStatement(utterance, match[0]),
        confidence: marker.type === 'direct' || marker.type === 'labeled' ? 0.95 : 0.75
      };
    }
  }

  return null;
}

/**
 * Extract pattern description from user's statement
 */
function extractPatternFromStatement(fullUtterance: string, matchedPortion: string): string {
  // Get surrounding context
  const sentences = fullUtterance.split(/[.!?]+/);
  for (const sentence of sentences) {
    if (sentence.includes(matchedPortion.substring(0, 20))) {
      return sentence.trim();
    }
  }
  return matchedPortion;
}

/**
 * Match current utterance against existing patterns in profile
 */
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

  // Sort by confidence
  return matched.sort((a, b) => b.matchConfidence - a.matchConfidence);
}

/**
 * Calculate match between utterance and a pattern
 */
function calculatePatternMatch(
  utteranceLower: string,
  pattern: UserPattern
): { confidence: number; evidence: string } {
  let confidence = 0;
  let evidence = '';

  // 1. Keyword matching from pattern description
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

  // 2. Check against pattern examples
  for (const example of pattern.examples) {
    const similarity = calculateSimilarity(utteranceLower, example.toLowerCase());
    if (similarity > 0.3) {
      confidence += similarity * 0.3;
      evidence = example.substring(0, 50);
      break;
    }
  }

  // 3. Thematic matching based on pattern type
  const thematicMatch = matchPatternType(utteranceLower, pattern.patternType);
  if (thematicMatch > 0) {
    confidence += thematicMatch * 0.3;
  }

  return { confidence: Math.min(confidence, 1), evidence };
}

/**
 * Extract meaningful keywords from a pattern description
 */
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

/**
 * Calculate simple word overlap similarity
 */
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

/**
 * Check if utterance matches pattern type thematically
 */
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

/**
 * Detect patterns that are emerging (1-2 occurrences) from conversation history
 */
function detectEmergingPatterns(
  input: TurnInput,
  existingPatterns: UserPattern[]
): EmergingPattern[] {
  const emerging: EmergingPattern[] = [];
  const existingDescriptions = new Set(existingPatterns.map(p => p.description.toLowerCase()));

  // Analyze conversation history for repetitions
  const userUtterances = input.conversationHistory
    .filter(turn => turn.role === 'user')
    .map(turn => turn.content.toLowerCase());

  // Add current utterance
  userUtterances.push(input.utterance.toLowerCase());

  // Look for thematic repetitions
  const themes = extractThemes(userUtterances);

  for (const [theme, occurrences] of Object.entries(themes)) {
    if (occurrences.count >= 2 && occurrences.count <= 3) {
      // Check if this is already an existing pattern
      if (!existingDescriptions.has(theme)) {
        emerging.push({
          description: theme,
          patternType: inferPatternType(theme),
          occurrenceCount: occurrences.count,
          examples: occurrences.examples.slice(0, 3),
          potentialSignificance: assessSignificance(theme, occurrences.count)
        });
      }
    }
  }

  return emerging;
}

/**
 * Extract thematic clusters from utterances
 */
function extractThemes(utterances: string[]): Record<string, { count: number; examples: string[] }> {
  const themes: Record<string, { count: number; examples: string[] }> = {};

  // Theme detection patterns
  const themePatterns = [
    { regex: /feeling (alone|isolated|lonely)/gi, theme: 'isolation and loneliness' },
    { regex: /(not|never) (good enough|worthy|deserving)/gi, theme: 'self-worth struggles' },
    { regex: /(control|controlling|controlled)/gi, theme: 'control dynamics' },
    { regex: /(trust|trusting|trusted|distrust)/gi, theme: 'trust issues' },
    { regex: /(abandon|left|leaving|leave me)/gi, theme: 'abandonment fears' },
    { regex: /(anger|angry|furious|rage)/gi, theme: 'anger patterns' },
    { regex: /(anxious|anxiety|worried|worry)/gi, theme: 'anxiety patterns' },
    { regex: /(sad|sadness|depressed|depression)/gi, theme: 'sadness patterns' },
    { regex: /(guilt|guilty|shame|ashamed)/gi, theme: 'guilt and shame' },
    { regex: /(perfecti|perfect|flawless)/gi, theme: 'perfectionism' },
    { regex: /(please|pleasing|approval)/gi, theme: 'people pleasing' },
    { regex: /(conflict|fight|argue|argument)/gi, theme: 'conflict patterns' },
    { regex: /(boundary|boundaries|saying no)/gi, theme: 'boundary issues' },
    { regex: /(compare|comparison|comparing)/gi, theme: 'comparison patterns' }
  ];

  for (const utterance of utterances) {
    for (const pattern of themePatterns) {
      if (pattern.regex.test(utterance)) {
        pattern.regex.lastIndex = 0; // Reset regex

        if (!themes[pattern.theme]) {
          themes[pattern.theme] = { count: 0, examples: [] };
        }
        themes[pattern.theme].count++;
        if (themes[pattern.theme].examples.length < 3) {
          themes[pattern.theme].examples.push(utterance.substring(0, 100));
        }
      }
    }
  }

  return themes;
}

/**
 * Infer pattern type from theme description
 */
function inferPatternType(theme: string): PatternType {
  const themeLower = theme.toLowerCase();

  if (themeLower.includes('feeling') || themeLower.includes('emotion') ||
      themeLower.includes('anger') || themeLower.includes('anxiety') ||
      themeLower.includes('sad') || themeLower.includes('guilt')) {
    return 'emotional';
  }

  if (themeLower.includes('relationship') || themeLower.includes('trust') ||
      themeLower.includes('abandon') || themeLower.includes('conflict') ||
      themeLower.includes('boundary')) {
    return 'relational';
  }

  if (themeLower.includes('avoid') || themeLower.includes('escape') ||
      themeLower.includes('isolation')) {
    return 'avoidance';
  }

  if (themeLower.includes('control') || themeLower.includes('perfect') ||
      themeLower.includes('protect')) {
    return 'protective';
  }

  if (themeLower.includes('think') || themeLower.includes('worry') ||
      themeLower.includes('comparison')) {
    return 'cognitive';
  }

  return 'behavioral';
}

/**
 * Assess significance of an emerging pattern
 */
function assessSignificance(theme: string, occurrences: number): string {
  if (occurrences >= 3) {
    return `This theme has appeared ${occurrences} times - may be a significant pattern worth exploring`;
  } else if (occurrences === 2) {
    return 'Recurring theme - monitor for further development';
  }
  return 'Initial observation';
}

/**
 * Calculate pattern resonance - how strongly does this utterance activate existing patterns
 */
function calculatePatternResonance(
  input: TurnInput,
  patterns: UserPattern[]
): PatternResonance[] {
  const resonances: PatternResonance[] = [];
  const utteranceLower = input.utterance.toLowerCase();

  for (const pattern of patterns) {
    if (!pattern.active) continue;

    // Calculate different types of resonance
    const directResonance = calculateDirectResonance(utteranceLower, pattern);
    const thematicResonance = calculateThematicResonance(utteranceLower, pattern);
    const emotionalResonance = calculateEmotionalResonance(utteranceLower, pattern);
    const structuralResonance = calculateStructuralResonance(input.utterance, pattern);

    // Find strongest resonance type
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
  // Direct word overlap
  const patternWords = extractKeywords(pattern.description);
  let matches = 0;

  for (const word of patternWords) {
    if (utterance.includes(word)) matches++;
  }

  return patternWords.length > 0 ? matches / patternWords.length : 0;
}

function calculateThematicResonance(utterance: string, pattern: UserPattern): number {
  // Same theme/topic area
  return matchPatternType(utterance, pattern.patternType);
}

function calculateEmotionalResonance(utterance: string, pattern: UserPattern): number {
  // Emotional tone similarity
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
  // Similar sentence structure patterns
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
      model: 'claude-3-haiku-20240307',
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
