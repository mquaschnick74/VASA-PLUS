// server/services/sensing-layer/movement-assessment.ts
// Movement Assessment module for the Sensing Layer
// Tracks therapeutic movement toward or away from mastery

import Anthropic from '@anthropic-ai/sdk';
import {
  TurnInput,
  UserTherapeuticProfile,
  MovementAssessmentResult,
  TherapeuticTrajectory,
  MovementIndicators,
  SessionPosition,
  MovementQuality,
  CSSStage,
  CSSHistoryEntry,
  AnticipationState
} from './types';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Movement indicator markers
 */
const MOVEMENT_MARKERS = {
  // Positive movement indicators
  deepening: [
    'deeper', 'more than', 'underneath', 'behind that', 'what\'s really',
    'actually', 'truth is', 'if i\'m honest', 'really feeling', 'at my core',
    'fundamentally', 'the real issue', 'what i haven\'t said'
  ],
  integration: [
    'i see now', 'makes sense', 'connecting', 'understanding', 'clarity',
    'coming together', 'realize', 'both can be true', 'i get it',
    'pieces fitting', 'whole picture', 'integrating'
  ],

  // Concerning movement indicators
  resistance: [
    'but', 'however', 'i don\'t know', 'maybe', 'i guess', 'whatever',
    'it doesn\'t matter', 'not a big deal', 'i\'m fine', 'moving on',
    'anyway', 'let\'s change', 'different topic', 'not now'
  ],
  flooding: [
    'overwhelmed', 'too much', 'can\'t handle', 'falling apart', 'drowning',
    'spinning', 'out of control', 'losing it', 'breaking down', 'panicking',
    'can\'t breathe', 'shutting down', 'dissociating'
  ],
  intellectualizing: [
    'logically', 'rationally', 'objectively', 'theoretically', 'in principle',
    'psychology says', 'i read that', 'the research', 'technically',
    'from a clinical perspective', 'analyzing', 'diagnosed'
  ],
  looping: [
    'like i said', 'as i mentioned', 'i keep saying', 'same thing',
    'round and round', 'here we go again', 'every time', 'always',
    'never changes', 'stuck', 'same place', 'going in circles'
  ]
};

/**
 * CSS Stage progression indicators
 */
const CSS_STAGE_MARKERS = {
  pointed_origin: [
    'problem', 'issue', 'struggle', 'difficult', 'hard time',
    'not sure', 'confused', 'lost', 'stuck', 'help'
  ],
  focus_bind: [
    'contradiction', 'torn', 'both', 'but also', 'part of me',
    'on one hand', 'want but', 'should but', 'conflicted', 'ambivalent'
  ],
  suspension: [
    'sitting with', 'holding', 'allowing', 'accepting', 'noticing',
    'without judging', 'just letting', 'being with', 'containing'
  ],
  gesture_toward: [
    'starting to', 'beginning', 'maybe i could', 'what if i',
    'possibility', 'different', 'new', 'trying', 'experimenting'
  ],
  completion: [
    'choose', 'decided', 'commit', 'action', 'doing', 'taking steps',
    'making changes', 'different now', 'moved on', 'learned'
  ],
  terminal: [
    'integrated', 'whole', 'peaceful', 'acceptance', 'wisdom',
    'growth', 'transformed', 'healed', 'resolved', 'complete'
  ]
};

/**
 * Assess therapeutic movement in the current exchange
 */
export async function assessMovement(
  input: TurnInput,
  profile: UserTherapeuticProfile
): Promise<MovementAssessmentResult> {
  console.log(`📈 [Movement Assessment] Processing for user: ${input.userId}`);

  const utteranceLower = input.utterance.toLowerCase();

  // 1. Calculate movement indicators
  const indicators = calculateMovementIndicators(utteranceLower);

  // 2. Determine trajectory based on indicators
  const trajectory = determineTrajectory(indicators, input.conversationHistory);

  // 3. Assess CSS stage
  const { cssStage, cssStageConfidence } = assessCSSStage(
    utteranceLower,
    profile.cssHistory,
    indicators
  );

  // 4. Determine session position
  const sessionPosition = determineSessionPosition(input.exchangeCount);

  // 5. Assess movement quality
  const movementQuality = assessMovementQuality(input, indicators);

  // 6. NEW: Assess anticipation - where is user headed, when to intervene
  const anticipation = await assessAnticipation(input, profile);

  console.log(`📈 [Movement Assessment] Trajectory: ${trajectory}, CSS: ${cssStage}, Position: ${sessionPosition}, Anticipation phase: ${anticipation.timing.phase}`);

  return {
    trajectory,
    indicators,
    cssStage,
    cssStageConfidence,
    sessionPosition,
    movementQuality,
    anticipation
  };
}

/**
 * Calculate presence of each movement indicator
 */
function calculateMovementIndicators(utterance: string): MovementIndicators {
  return {
    deepening: calculateIndicatorScore(utterance, MOVEMENT_MARKERS.deepening),
    integration: calculateIndicatorScore(utterance, MOVEMENT_MARKERS.integration),
    resistance: calculateIndicatorScore(utterance, MOVEMENT_MARKERS.resistance),
    flooding: calculateIndicatorScore(utterance, MOVEMENT_MARKERS.flooding),
    intellectualizing: calculateIndicatorScore(utterance, MOVEMENT_MARKERS.intellectualizing),
    looping: calculateIndicatorScore(utterance, MOVEMENT_MARKERS.looping)
  };
}

/**
 * Calculate score for a set of indicator markers
 */
function calculateIndicatorScore(utterance: string, markers: string[]): number {
  let matches = 0;

  for (const marker of markers) {
    if (utterance.includes(marker)) {
      matches++;
    }
  }

  // Normalize to 0-1 range, with diminishing returns for many matches
  return Math.min(1, matches * 0.2);
}

/**
 * Determine overall therapeutic trajectory
 */
function determineTrajectory(
  indicators: MovementIndicators,
  conversationHistory: { role: string; content: string }[]
): TherapeuticTrajectory {
  // Calculate positive and negative movement scores
  const positiveScore = (indicators.deepening + indicators.integration) / 2;
  const negativeScore = (indicators.resistance + indicators.flooding + indicators.looping) / 3;

  // Check for holding (low movement in either direction)
  if (positiveScore < 0.2 && negativeScore < 0.2) {
    return 'holding';
  }

  // Check for cycling (repeated themes in conversation history)
  if (indicators.looping > 0.4) {
    const recentUserContent = conversationHistory
      .filter(t => t.role === 'user')
      .slice(-5)
      .map(t => t.content.toLowerCase());

    if (detectThematicRepetition(recentUserContent)) {
      return 'cycling';
    }
  }

  // Check for flooding (overwhelm takes precedence)
  if (indicators.flooding > 0.4) {
    return 'away_from_mastery';
  }

  // Compare positive vs negative
  if (positiveScore > negativeScore + 0.1) {
    return 'toward_mastery';
  } else if (negativeScore > positiveScore + 0.1) {
    return 'away_from_mastery';
  }

  return 'holding';
}

/**
 * Detect thematic repetition in recent utterances
 */
function detectThematicRepetition(utterances: string[]): boolean {
  if (utterances.length < 3) return false;

  // Extract key phrases and check for repetition
  const keyPhrases: Set<string>[] = utterances.map(u => {
    const phrases = new Set<string>();
    // Extract 2-3 word phrases
    const words = u.split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].length > 3 && words[i + 1].length > 3) {
        phrases.add(`${words[i]} ${words[i + 1]}`);
      }
    }
    return phrases;
  });

  // Count phrase repetitions
  let repetitions = 0;
  for (let i = 0; i < keyPhrases.length; i++) {
    for (let j = i + 1; j < keyPhrases.length; j++) {
      for (const phrase of Array.from(keyPhrases[i])) {
        if (keyPhrases[j].has(phrase)) {
          repetitions++;
        }
      }
    }
  }

  return repetitions >= 3;
}

/**
 * Assess current CSS stage
 */
function assessCSSStage(
  utterance: string,
  cssHistory: CSSHistoryEntry[],
  indicators: MovementIndicators
): { cssStage: CSSStage; cssStageConfidence: number } {
  // Score each stage based on markers
  const stageScores: Record<CSSStage, number> = {
    pointed_origin: calculateIndicatorScore(utterance, CSS_STAGE_MARKERS.pointed_origin),
    focus_bind: calculateIndicatorScore(utterance, CSS_STAGE_MARKERS.focus_bind),
    suspension: calculateIndicatorScore(utterance, CSS_STAGE_MARKERS.suspension),
    gesture_toward: calculateIndicatorScore(utterance, CSS_STAGE_MARKERS.gesture_toward),
    completion: calculateIndicatorScore(utterance, CSS_STAGE_MARKERS.completion),
    terminal: calculateIndicatorScore(utterance, CSS_STAGE_MARKERS.terminal)
  };

  // Boost based on integration indicator
  if (indicators.integration > 0.3) {
    stageScores.suspension += 0.1;
    stageScores.gesture_toward += 0.15;
    stageScores.completion += 0.1;
  }

  // Reduce later stages if resistance is high
  if (indicators.resistance > 0.3) {
    stageScores.gesture_toward *= 0.7;
    stageScores.completion *= 0.5;
    stageScores.terminal *= 0.3;
  }

  // Consider CSS history for momentum
  if (cssHistory.length > 0) {
    const lastStage = cssHistory[cssHistory.length - 1].stage;
    const stageOrder: CSSStage[] = [
      'pointed_origin', 'focus_bind', 'suspension',
      'gesture_toward', 'completion', 'terminal'
    ];
    const lastIndex = stageOrder.indexOf(lastStage);

    // Boost nearby stages (therapeutic continuity)
    for (let i = Math.max(0, lastIndex - 1); i <= Math.min(stageOrder.length - 1, lastIndex + 1); i++) {
      stageScores[stageOrder[i]] += 0.15;
    }
  }

  // Find highest scoring stage
  let highestStage: CSSStage = 'pointed_origin';
  let highestScore = 0;

  for (const [stage, score] of Object.entries(stageScores)) {
    if (score > highestScore) {
      highestScore = score;
      highestStage = stage as CSSStage;
    }
  }

  // Calculate confidence
  const scores = Object.values(stageScores);
  const maxScore = Math.max(...scores);
  const secondMax = Math.max(...scores.filter(s => s !== maxScore));
  const confidence = maxScore > 0 ? Math.min(1, (maxScore - secondMax) + 0.3) : 0.3;

  return {
    cssStage: highestStage,
    cssStageConfidence: confidence
  };
}

/**
 * Determine position within the session
 */
function determineSessionPosition(exchangeCount: number): SessionPosition {
  // Typical session has 15-25 exchanges
  if (exchangeCount <= 3) return 'opening';
  if (exchangeCount <= 8) return 'developing';
  if (exchangeCount <= 18) return 'working';
  if (exchangeCount <= 23) return 'integrating';
  return 'closing';
}

/**
 * Assess the quality of therapeutic movement
 */
function assessMovementQuality(
  input: TurnInput,
  indicators: MovementIndicators
): MovementQuality {
  // Assess pace based on utterance length and indicators
  let pace: MovementQuality['pace'] = 'steady';
  if (input.utterance.length < 50 && indicators.resistance > 0.2) {
    pace = 'slow';
  } else if (input.utterance.length < 30) {
    pace = 'stuck';
  } else if (input.utterance.length > 300 && indicators.flooding < 0.2) {
    pace = 'rushed';
  }

  // Assess depth based on indicators
  let depth: MovementQuality['depth'] = 'moderate';
  if (indicators.deepening > 0.5) {
    depth = 'very_deep';
  } else if (indicators.deepening > 0.2) {
    depth = 'deep';
  } else if (indicators.intellectualizing > 0.3 || indicators.resistance > 0.3) {
    depth = 'surface';
  }

  // Assess coherence based on conversation flow
  let coherence: MovementQuality['coherence'] = 'developing';
  if (indicators.integration > 0.4) {
    coherence = 'integrated';
  } else if (indicators.integration > 0.2 && indicators.looping < 0.2) {
    coherence = 'coherent';
  } else if (indicators.looping > 0.3 || indicators.flooding > 0.3) {
    coherence = 'fragmented';
  }

  return { pace, depth, coherence };
}

/**
 * Get therapeutic recommendations based on movement assessment
 */
export function getMovementRecommendations(result: MovementAssessmentResult): string[] {
  const recommendations: string[] = [];

  // Trajectory-based recommendations
  switch (result.trajectory) {
    case 'away_from_mastery':
      if (result.indicators.flooding > 0.3) {
        recommendations.push('User may be flooded. Consider grounding or pacing interventions.');
      }
      if (result.indicators.resistance > 0.3) {
        recommendations.push('Resistance detected. Consider honoring defenses while gently exploring.');
      }
      break;

    case 'cycling':
      recommendations.push('User appears to be cycling. Consider introducing new perspective or bodily awareness.');
      break;

    case 'holding':
      if (result.sessionPosition === 'working') {
        recommendations.push('User in holding pattern during working phase. Gentle challenge may invite movement.');
      }
      break;

    case 'toward_mastery':
      recommendations.push('Positive movement detected. Support continued exploration.');
      break;
  }

  // CSS stage recommendations
  switch (result.cssStage) {
    case 'pointed_origin':
      recommendations.push('Early stage: Focus on building alliance and exploring presenting concerns.');
      break;

    case 'focus_bind':
      recommendations.push('Contradiction emerging: Help user hold both sides without rushing to resolve.');
      break;

    case 'suspension':
      recommendations.push('In suspension: Support the capacity to sit with complexity.');
      break;

    case 'gesture_toward':
      recommendations.push('Movement beginning: Support emerging possibilities without pushing.');
      break;
  }

  // Quality-based recommendations
  if (result.movementQuality.depth === 'surface') {
    recommendations.push('Superficial engagement: Consider inviting deeper exploration.');
  }

  if (result.movementQuality.coherence === 'fragmented') {
    recommendations.push('Fragmented narrative: Consider helping organize experience.');
  }

  return recommendations;
}

/**
 * Assess anticipation - where is the user headed and when should we intervene
 */
async function assessAnticipation(
  input: TurnInput,
  profile: UserTherapeuticProfile
): Promise<AnticipationState> {
  // Try Claude-based assessment if API key available
  if (process.env.ANTHROPIC_API_KEY && input.conversationHistory.length >= 3) {
    try {
      return await assessAnticipationWithClaude(input, profile);
    } catch (error) {
      console.error('📈 [Movement Assessment] Claude anticipation failed, using heuristics:', error);
    }
  }

  // Fall back to heuristic-based assessment
  return assessAnticipationHeuristic(input, profile);
}

/**
 * Heuristic-based anticipation assessment (fast fallback)
 */
function assessAnticipationHeuristic(
  input: TurnInput,
  profile: UserTherapeuticProfile
): AnticipationState {
  const utteranceLower = input.utterance.toLowerCase();
  const exchangeCount = input.exchangeCount;

  // Determine phase based on session position and indicators
  let phase: AnticipationState['timing']['phase'] = 'building';
  const waitReasons: string[] = [];
  const readyIndicators: string[] = [];

  // Early in session = early elaboration
  if (exchangeCount < 5) {
    phase = 'early_elaboration';
    waitReasons.push('still in early session');
  }

  // Check for readiness indicators
  const insightMarkers = ['i realize', 'i see', 'it\'s like', 'i think i', 'maybe it\'s'];
  const connectionMarkers = ['reminds me', 'same as', 'just like', 'similar to'];
  const groundingMarkers = ['i feel', 'in my body', 'notice', 'sensation'];

  let readinessScore = 0;

  for (const marker of insightMarkers) {
    if (utteranceLower.includes(marker)) {
      readinessScore += 0.2;
      readyIndicators.push(`insight marker: "${marker}"`);
    }
  }

  for (const marker of connectionMarkers) {
    if (utteranceLower.includes(marker)) {
      readinessScore += 0.15;
      readyIndicators.push(`connection marker: "${marker}"`);
    }
  }

  for (const marker of groundingMarkers) {
    if (utteranceLower.includes(marker)) {
      readinessScore += 0.1;
      readyIndicators.push(`grounding marker: "${marker}"`);
    }
  }

  // Adjust phase based on readiness score
  if (readinessScore >= 0.5) {
    phase = 'ready';
  } else if (readinessScore >= 0.3) {
    phase = 'approaching_readiness';
  } else if (exchangeCount > 10 && readinessScore < 0.1) {
    waitReasons.push('user still elaborating without clear direction');
  }

  // Check for signs we should wait
  const elaborationMarkers = ['and then', 'also', 'another thing', 'let me tell you'];
  for (const marker of elaborationMarkers) {
    if (utteranceLower.includes(marker)) {
      waitReasons.push('user still elaborating');
      if (phase === 'approaching_readiness') {
        phase = 'building';
      }
      break;
    }
  }

  // Estimate turns to ready
  const estimatedTurnsToReady = phase === 'ready' ? 0 :
    phase === 'approaching_readiness' ? 1 :
    phase === 'building' ? 3 :
    5;

  // Determine shouldWait
  const shouldWait = phase !== 'ready' && phase !== 'moment_passed';

  // Build trajectory from patterns
  const activePatternDescriptions = profile.patterns
    .filter(p => p.active)
    .slice(0, 3)
    .map(p => p.description);

  const buildingToward = activePatternDescriptions.length > 0
    ? `exploring patterns: ${activePatternDescriptions.join(', ')}`
    : 'initial exploration of concerns';

  return {
    trajectory: {
      buildingToward,
      trajectoryConfidence: Math.min(0.7, 0.3 + (exchangeCount * 0.03)),
      evidencePoints: readyIndicators.slice(0, 3)
    },
    timing: {
      phase,
      waitReasons: waitReasons.slice(0, 3),
      readyIndicators: readyIndicators.slice(0, 3),
      estimatedTurnsToReady
    },
    patience: {
      shouldWait,
      waitingFor: shouldWait ? (waitReasons[0] || 'more user elaboration') : 'n/a - ready to engage',
      riskOfPrematureIntervention: shouldWait
        ? 'may interrupt natural discovery process'
        : 'low risk - user showing readiness'
    }
  };
}

/**
 * Attempt to extract and parse JSON from a text response.
 * Uses a balanced-brace approach to find the outermost JSON object,
 * then attempts repair if initial parsing fails.
 */
function extractAndParseJSON(text: string): Record<string, unknown> | null {
  // Find the first '{' and extract a balanced JSON object
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let endIdx = -1;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) return null;

  let jsonStr = text.substring(startIdx, endIdx + 1);

  // Fix invalid JSON escaping: \' is not valid JSON (single quotes don't need escaping)
  jsonStr = jsonStr.replace(/\\'/g, "'");

  // Attempt 1: Direct parse
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (directError) {
    console.warn('📈 [Movement Assessment] Direct JSON parse failed, attempting repair:', (directError as Error).message);
  }

  // Attempt 2: Repair common issues
  let repaired = jsonStr
    .replace(/,\s*([}\]])/g, '$1')              // Remove trailing commas
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')  // Quote unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"')         // Single quotes to double quotes
    .replace(/\btrue\b/g, 'true')                // Normalize booleans (no-op but explicit)
    .replace(/\bfalse\b/g, 'false')
    .replace(/[\x00-\x1F\x7F]/g, ' ');           // Remove control characters
  // Re-apply \' fix in case repair steps reintroduced it
  repaired = repaired.replace(/\\'/g, "'");

  try {
    return JSON.parse(repaired) as Record<string, unknown>;
  } catch (repairError) {
    console.warn('📈 [Movement Assessment] Repaired JSON parse also failed:', (repairError as Error).message);
    console.warn('📈 [Movement Assessment] Raw extracted JSON:', jsonStr.substring(0, 500));
  }

  return null;
}

/**
 * Claude-based anticipation assessment (more sophisticated)
 */
async function assessAnticipationWithClaude(
  input: TurnInput,
  profile: UserTherapeuticProfile
): Promise<AnticipationState> {
  const recentHistory = input.conversationHistory.slice(-8);
  const recentUserTurns = recentHistory
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n---\n');

  const patternsContext = profile.patterns
    .filter(p => p.active)
    .map(p => p.description)
    .join(', ');

  const prompt = `You are tracking therapeutic conversation trajectory. Analyze where this user is headed and whether it's time to intervene or wait.

## User's Known Patterns:
${patternsContext || 'None detected yet'}

## Recent User Turns:
${recentUserTurns}

## Current Utterance:
"${input.utterance}"

## Task

Assess the user's trajectory and optimal intervention timing.

CRITICAL: Your response must be ONLY a single valid JSON object. No text before or after it. No markdown code fences. No explanation. Just the JSON object.

Required JSON structure:
{
  "trajectory": {
    "buildingToward": "description of what user is building toward",
    "trajectoryConfidence": 0.5,
    "evidencePoints": ["evidence 1", "evidence 2"]
  },
  "timing": {
    "phase": "building",
    "waitReasons": ["reason 1"],
    "readyIndicators": ["indicator 1"],
    "estimatedTurnsToReady": 3
  },
  "patience": {
    "shouldWait": true,
    "waitingFor": "what to wait for",
    "riskOfPrematureIntervention": "what could go wrong"
  }
}

Rules:
- phase must be one of: "early_elaboration", "building", "approaching_readiness", "ready", "moment_passed"
- trajectoryConfidence must be a number between 0.0 and 1.0
- estimatedTurnsToReady must be an integer
- shouldWait must be true or false (not quoted)
- All string values must use double quotes with special characters escaped
- No trailing commas
- Output ONLY the JSON object, nothing else`;

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }]
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    console.warn('📈 [Movement Assessment] Non-text response from Claude, falling back to heuristics');
    return assessAnticipationHeuristic(input, profile);
  }

  const rawText = content.text;
  const parsed = extractAndParseJSON(rawText);

  if (!parsed) {
    console.error('📈 [Movement Assessment] Failed to extract JSON from Claude response.');
    console.error('📈 [Movement Assessment] Raw response (first 800 chars):', rawText.substring(0, 800));
    return assessAnticipationHeuristic(input, profile);
  }

  // Safely destructure with defaults - handles partial/malformed structures
  const trajectory = (parsed.trajectory ?? {}) as Record<string, unknown>;
  const timing = (parsed.timing ?? {}) as Record<string, unknown>;
  const patience = (parsed.patience ?? {}) as Record<string, unknown>;

  return {
    trajectory: {
      buildingToward: typeof trajectory.buildingToward === 'string' ? trajectory.buildingToward : 'unclear',
      trajectoryConfidence: Math.min(1, Math.max(0, typeof trajectory.trajectoryConfidence === 'number' ? trajectory.trajectoryConfidence : 0.3)),
      evidencePoints: Array.isArray(trajectory.evidencePoints) ? trajectory.evidencePoints : []
    },
    timing: {
      phase: validatePhase(typeof timing.phase === 'string' ? timing.phase : 'building'),
      waitReasons: Array.isArray(timing.waitReasons) ? timing.waitReasons : [],
      readyIndicators: Array.isArray(timing.readyIndicators) ? timing.readyIndicators : [],
      estimatedTurnsToReady: typeof timing.estimatedTurnsToReady === 'number' ? timing.estimatedTurnsToReady : 3
    },
    patience: {
      shouldWait: typeof patience.shouldWait === 'boolean' ? patience.shouldWait : true,
      waitingFor: typeof patience.waitingFor === 'string' ? patience.waitingFor : 'more elaboration',
      riskOfPrematureIntervention: typeof patience.riskOfPrematureIntervention === 'string' ? patience.riskOfPrematureIntervention : 'may short-circuit discovery'
    }
  };
}

/**
 * Validate anticipation phase value
 */
function validatePhase(phase: string): AnticipationState['timing']['phase'] {
  const valid = ['early_elaboration', 'building', 'approaching_readiness', 'ready', 'moment_passed'];
  if (valid.includes(phase)) {
    return phase as AnticipationState['timing']['phase'];
  }
  return 'building';
}
