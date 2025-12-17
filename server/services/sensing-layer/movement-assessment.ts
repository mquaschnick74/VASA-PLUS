// server/services/sensing-layer/movement-assessment.ts
// Movement Assessment module for the Sensing Layer
// Tracks therapeutic movement toward or away from mastery

import {
  TurnInput,
  UserTherapeuticProfile,
  MovementAssessmentResult,
  TherapeuticTrajectory,
  MovementIndicators,
  SessionPosition,
  MovementQuality,
  CSSStage,
  CSSHistoryEntry
} from './types';

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

  console.log(`📈 [Movement Assessment] Trajectory: ${trajectory}, CSS: ${cssStage}, Position: ${sessionPosition}`);

  return {
    trajectory,
    indicators,
    cssStage,
    cssStageConfidence,
    sessionPosition,
    movementQuality
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
