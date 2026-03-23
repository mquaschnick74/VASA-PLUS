// server/services/sensing-layer/movement-assessment.ts
// Movement Assessment module for the Sensing Layer
// Detects CSS signals per utterance and assesses therapeutic trajectory.
//
// ARCHITECTURE NOTE:
// This module does NOT produce a CSS stage verdict per utterance.
// It produces CSSSignal[] — low-confidence indicators that accumulate
// in session-state.ts via recordCSSSignals(). The session-level stage
// is assessed at milestones (exchanges 5, 10, 15, 20) by assessSessionCSSStage().
// state-vector.ts receives the session-level stage, not the per-utterance signals.

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
  AnticipationState,
  CSSSignal,
  CSSSignalIndicator
} from './types';

/**
 * Movement indicator markers
 */
const MOVEMENT_MARKERS = {
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
 * Assess therapeutic movement in the current exchange.
 * Returns movement indicators, trajectory, session position, quality,
 * heuristic anticipation, and per-utterance CSS signals.
 *
 * cssStage and cssStageConfidence are set to placeholder values here.
 * The authoritative session-level CSS stage lives in session-state.ts.
 */
export async function assessMovement(
  input: TurnInput,
  profile: UserTherapeuticProfile
): Promise<MovementAssessmentResult> {
  console.log(`📈 [Movement Assessment] Processing for user: ${input.userId}`);

  const utteranceLower = input.utterance.toLowerCase();

  // 1. Calculate movement indicators
  const indicators = calculateMovementIndicators(utteranceLower);

  // 2. Determine trajectory
  const trajectory = determineTrajectory(indicators, input.conversationHistory);

  // 3. Detect CSS signals (replaces single-turn stage assessment)
  const cssSignals = detectCSSSignals(
    input.utterance,
    utteranceLower,
    input.conversationHistory,
    input.exchangeCount
  );

  // 4. Session position
  const sessionPosition = determineSessionPosition(input.exchangeCount);

  // 5. Movement quality
  const movementQuality = assessMovementQuality(input, indicators);

  // 6. Heuristic anticipation (no Claude call — folded into guidance generator)
  const anticipation = assessAnticipationHeuristic(input, profile);

  // cssStage placeholder — overridden by state-vector.ts using session-level stage
  // Do not use this value directly for clinical decisions
  const cssStage: CSSStage = profile.cssHistory.length > 0
    ? profile.cssHistory[profile.cssHistory.length - 1].stage
    : 'pointed_origin';
  const cssStageConfidence = 0.3;

  console.log(`📈 [Movement Assessment] Trajectory: ${trajectory}, CSS signals: ${cssSignals.length}, Position: ${sessionPosition}, Anticipation phase: ${anticipation.timing.phase}`);

  return {
    trajectory,
    indicators,
    cssStage,
    cssStageConfidence,
    sessionPosition,
    movementQuality,
    anticipation,
    cssSignals,
    assessmentSource: 'fast' as const,
    structuralDescription: null,
  };
}

/**
 * Detect CSS stage signals from a single utterance.
 *
 * CLINICAL BASIS:
 * - Pointed Origin: fragmentation without observer self
 * - Focus/Bind: implicit contradiction the client hasn't named (analyst sees it)
 * - Suspension: somatic contact without interpretation; terminal not-knowing
 * - Gesture Toward: witnessed shift with surprise; possibility language
 * - Completion: speaking FROM integrated position; past-tense fragmentation
 * - Terminal: observing self in recursion; meta-awareness of the process
 *
 * All confidence values are deliberately low (0.35–0.55).
 * These signals accumulate across turns; session state determines stage.
 */
function detectCSSSignals(
  utterance: string,
  utteranceLower: string,
  conversationHistory: { role: string; content: string }[],
  exchangeNumber: number
): CSSSignal[] {
  const signals: CSSSignal[] = [];

  // ── POINTED ORIGIN ──────────────────────────────────────────
  // Help seeking: explicit expressions of lostness, confusion, seeking
  const helpSeekingPatterns = [
    /\bi don'?t know what to do\b/,
    /\bi('?m| am) (so |really |completely )?(lost|confused|stuck)\b/,
    /\bi need help\b/,
    /\bi don'?t understand (why |what |how )\b/,
    /\bi can'?t figure (this |it |out)\b/,
    /\bnothing makes sense\b/,
    /\bi don'?t know where to start\b/
  ];
  for (const pattern of helpSeekingPatterns) {
    if (pattern.test(utteranceLower)) {
      signals.push({
        stage: 'pointed_origin',
        confidence: 0.35,
        indicatorType: 'help_seeking',
        evidence: utterance.substring(0, 100),
        exchangeNumber
      });
      break;
    }
  }

  // ── FOCUS/BIND ───────────────────────────────────────────────
  // Motive confusion: client cannot explain their own behavior
  const motiveConfusionPatterns = [
    /\bi don'?t know why i (do|keep|keep doing|did|always|never)\b/,
    /\bi don'?t understand why i\b/,
    /\bi can'?t explain why i\b/,
    /\bi don'?t know what makes me\b/
  ];
  for (const pattern of motiveConfusionPatterns) {
    if (pattern.test(utteranceLower)) {
      signals.push({
        stage: 'focus_bind',
        confidence: 0.45,
        indicatorType: 'motive_confusion',
        evidence: utterance.substring(0, 100),
        exchangeNumber
      });
      break;
    }
  }

  // Desire negation: "I want X. I just can't Y." — structural self-contradiction
  const desireNegationPattern = /\bi (want|need|wish) (to |that )?.{3,40}[.,]\s*(but |i just |i can'?t |i don'?t |i won'?t |yet )/;
  if (desireNegationPattern.test(utteranceLower)) {
    signals.push({
      stage: 'focus_bind',
      confidence: 0.40,
      indicatorType: 'desire_negation',
      evidence: utterance.substring(0, 120),
      exchangeNumber
    });
  }

  // Implicit contradiction: across adjacent user turns (client states ending, then reports continuing)
  const recentUserTurns = conversationHistory
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content.toLowerCase());

  if (recentUserTurns.length >= 2) {
    const contradictionEvidence = detectImplicitContradiction(recentUserTurns);
    if (contradictionEvidence) {
      signals.push({
        stage: 'focus_bind',
        confidence: 0.40,
        indicatorType: 'implicit_contradiction',
        evidence: contradictionEvidence,
        exchangeNumber
      });
    }
  }

  // ── SUSPENSION ───────────────────────────────────────────────
  // Unexplained somatic: body reference NOT immediately interpreted
  const somaticPattern = /\b(chest|stomach|gut|throat|shoulders|neck|jaw|hands|body|heart|breath|breathing|heavy|tight|tense|numb|hollow|ache|weight|pressure|flutter|sinking)\b/;
  const interpretationPattern = /\b(because|which means|that'?s (because|why|what)|probably|likely|this is|i think|that means|suggesting|it'?s (about|related|connected))\b/;

  const somaticMatch = utteranceLower.match(somaticPattern);
  if (somaticMatch) {
    const somaticIdx = utteranceLower.indexOf(somaticMatch[0]);
    const afterSomatic = utteranceLower.substring(somaticIdx, somaticIdx + 120);
    if (!interpretationPattern.test(afterSomatic)) {
      signals.push({
        stage: 'suspension',
        confidence: 0.45,
        indicatorType: 'unexplained_somatic',
        evidence: utterance.substring(
          Math.max(0, somaticIdx - 20),
          Math.min(utterance.length, somaticIdx + 100)
        ),
        exchangeNumber
      });
    }
  }

  // Terminal not-knowing: "I don't know." as sentence end, not setup for theory
  const terminalNotKnowingPattern = /\bi don'?t know\.?\s*$/;
  const notKnowingSetupPattern = /\bi don'?t know (why|what|how|if|whether)\b/;
  if (terminalNotKnowingPattern.test(utteranceLower) && !notKnowingSetupPattern.test(utteranceLower)) {
    signals.push({
      stage: 'suspension',
      confidence: 0.40,
      indicatorType: 'not_knowing_terminal',
      evidence: utterance.substring(Math.max(0, utterance.length - 60)),
      exchangeNumber
    });
  }

  // Incomplete utterance: trailing without resolution (voice transcription artifact)
  const incompletePatterns = [
    /\.\.\.\s*$/,
    /\bi just\.?\s*$/,
    /\bit'?s (like|just)\s*\.?\s*$/,
    /\bi (feel|felt)\s*\.?\s*$/
  ];
  for (const pattern of incompletePatterns) {
    if (pattern.test(utteranceLower.trim())) {
      signals.push({
        stage: 'suspension',
        confidence: 0.35,
        indicatorType: 'incomplete_utterance',
        evidence: utterance.substring(Math.max(0, utterance.length - 80)),
        exchangeNumber
      });
      break;
    }
  }

  // ── GESTURE TOWARD ───────────────────────────────────────────
  // Witnessed shift: integration reported from outside with surprise/tentativeness
  // Per Eve's specimen: "something changed", "I don't know what changed", surprise language
  const witnessedShiftPatterns = [
    /\bsomething (changed|shifted|happened|clicked)\b/,
    /\bi (felt|feel) (like |that )?(something |it )?(changed|shifted|different)\b/,
    /\bi don'?t know what changed\b/,
    /\bit (was|felt) (insane|strange|weird|surprising|unexpected)\b/
  ];
  const surpriseBoostPattern = /\b(insane|strange|weird|surprising|unexpected|i don'?t know what|all of a sudden|out of nowhere)\b/;
  for (const pattern of witnessedShiftPatterns) {
    if (pattern.test(utteranceLower)) {
      const confidence = surpriseBoostPattern.test(utteranceLower) ? 0.55 : 0.40;
      signals.push({
        stage: 'gesture_toward',
        confidence,
        indicatorType: 'witnessed_shift',
        evidence: utterance.substring(0, 120),
        exchangeNumber
      });
      break;
    }
  }

  // Possibility language: tentative, exploratory orientation toward new position
  const possibilityPatterns = [
    /\bmaybe i (could|can|should|might)\b/,
    /\bwhat if i\b/,
    /\bi('?m| am) starting to\b/,
    /\bi('?m| am) beginning to\b/,
    /\bi wonder if i\b/,
    /\bwhat would (it|that) (be like|look like|feel like) if i\b/
  ];
  for (const pattern of possibilityPatterns) {
    if (pattern.test(utteranceLower)) {
      signals.push({
        stage: 'gesture_toward',
        confidence: 0.40,
        indicatorType: 'possibility_language',
        evidence: utterance.substring(0, 100),
        exchangeNumber
      });
      break;
    }
  }

  // ── COMPLETION ───────────────────────────────────────────────
  // Inhabited integration: speaking FROM the integrated position, not watching it
  // Key: capacity language, not surprise language
  const inhabitedPatterns = [
    /\bi can (hold|accept|sit with|tolerate|be with) (both|it|this|that)\b/,
    /\bit (doesn'?t|don'?t) have to be (one or the other|either|all or nothing)\b/,
    /\bit just makes sense (to me )?(now)?\b/,
    /\bboth (can be|are) true\b/,
    /\bi (can|am able to) (now|finally|actually)\b/
  ];
  for (const pattern of inhabitedPatterns) {
    if (pattern.test(utteranceLower)) {
      signals.push({
        stage: 'completion',
        confidence: 0.55,
        indicatorType: 'inhabited_integration',
        evidence: utterance.substring(0, 120),
        exchangeNumber
      });
      break;
    }
  }

  // Past tense fragmentation: prior struggle referenced from a distance
  const pastTensePatterns = [
    /\bi used to (get|be|feel|think|believe|always|never)\b/,
    /\bi would always\b.{0,20}\b(but|now)\b/,
    /\bbefore (this|therapy|we)\b.{0,30}\b(i would|i'd|i was)\b/,
    /\bthat used to\b/
  ];
  for (const pattern of pastTensePatterns) {
    if (pattern.test(utteranceLower)) {
      signals.push({
        stage: 'completion',
        confidence: 0.45,
        indicatorType: 'past_tense_fragmentation',
        evidence: utterance.substring(0, 120),
        exchangeNumber
      });
      break;
    }
  }

  // ── TERMINAL ─────────────────────────────────────────────────
  // Observing self: meta-position on own process — the defining Terminal marker
  const observingSelfPatterns = [
    /\bi notice (that )?i('?m| am) (doing this|doing it|going back|returning)\b/,
    /\bi('?m| am) aware (that )?i('?m| am)\b/,
    /\bi recognize (that )?i('?m| am) (doing|having|in)\b/,
    /\bi can see (myself|that i('?m| am))\b/,
    /\bi('?m| am) watching myself\b/
  ];
  for (const pattern of observingSelfPatterns) {
    if (pattern.test(utteranceLower)) {
      signals.push({
        stage: 'terminal',
        confidence: 0.55,
        indicatorType: 'observing_self',
        evidence: utterance.substring(0, 120),
        exchangeNumber
      });
      break;
    }
  }

  // Recursive awareness: naming the recursion or return to prior material
  const recursiveAwarenessPatterns = [
    /\b(i('?m| am) going back to|returning to|revisiting) this\b/,
    /\b(i sense|i feel|i know) (that )?something('?s| is) (still )?unresolved\b/,
    /\bthis is that same (pattern|thing|dynamic|feeling)\b/,
    /\bi('?m| am) doing (that thing|the thing|it) again\b/,
    /\bi('?ve| have) been here before\b.{0,30}\b(but|this time|now)\b/
  ];
  for (const pattern of recursiveAwarenessPatterns) {
    if (pattern.test(utteranceLower)) {
      signals.push({
        stage: 'terminal',
        confidence: 0.50,
        indicatorType: 'recursive_awareness',
        evidence: utterance.substring(0, 120),
        exchangeNumber
      });
      break;
    }
  }

  // Historical integration reference: referencing prior integration work by name/event
  const historicalIntegrationPatterns = [
    /\blike (what happened|when we talked about|that time with|what we worked on)\b/,
    /\bsame (as|like) (when|what|how) (we|i|you)\b.{0,30}\b(worked through|talked about|dealt with)\b/,
    /\b(remember|like) (when|that time)\b.{0,30}\b(resolved|clicked|shifted|worked through)\b/
  ];
  for (const pattern of historicalIntegrationPatterns) {
    if (pattern.test(utteranceLower)) {
      signals.push({
        stage: 'terminal',
        confidence: 0.50,
        indicatorType: 'historical_integration_ref',
        evidence: utterance.substring(0, 120),
        exchangeNumber
      });
      break;
    }
  }

  return signals;
}

/**
 * Detect implicit contradiction across adjacent user turns.
 * Focus/Bind: client states ending/resolution, then reports continued behavior.
 * The client does NOT register the inconsistency — that's the clinical marker.
 */
function detectImplicitContradiction(recentUserTurns: string[]): string | null {
  const lastTurn = recentUserTurns[recentUserTurns.length - 1];
  const prevTurn = recentUserTurns[recentUserTurns.length - 2];

  // Prior turn claims ending/resolution
  const endingClaims = [
    /\bi('?m| am) done with\b/,
    /\bi('?ve| have) (decided|chosen) (to |that )?not\b/,
    /\bi (quit|left|ended|stopped|finished)\b/,
    /\bi don'?t want (this|that|it|them|him|her) anymore\b/,
    /\bi('?m| am) moving on\b/,
    /\bi('?m| am) not going to\b/
  ];

  // Current turn reports continuation of that same behavior
  const continuationBehaviors = [
    /\bi (went back|went again|did it again|called|texted|messaged|applied|tried again)\b/,
    /\bi (ended up|found myself)\b/,
    /\bi still\b/,
    /\bbut (i|then i)\b/
  ];

  let hasEndingClaim = false;
  for (const pattern of endingClaims) {
    if (pattern.test(prevTurn)) { hasEndingClaim = true; break; }
  }

  let hasContinuation = false;
  for (const pattern of continuationBehaviors) {
    if (pattern.test(lastTurn)) { hasContinuation = true; break; }
  }

  if (hasEndingClaim && hasContinuation) {
    return 'Contradiction across turns: stated ending/resolution but behavior continued without acknowledgment';
  }

  // Within-turn desire-behavior contradiction (want closeness, describe distancing)
  const desiresConnection = /\b(want|need|crave|love).{0,40}(close|together|connected|intimate|relationship)\b/;
  const describeDistancing = /\b(can'?t|don'?t|won'?t|avoid|push away|keep away|distance|never let)\b/;
  if (desiresConnection.test(lastTurn) && describeDistancing.test(lastTurn)) {
    return 'Within-turn contradiction: expresses desire for connection while describing distancing behavior';
  }

  return null;
}

/**
 * Calculate movement indicators from utterance
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

function calculateIndicatorScore(utterance: string, markers: string[]): number {
  let matches = 0;
  for (const marker of markers) {
    if (utterance.includes(marker)) matches++;
  }
  return Math.min(1, matches * 0.2);
}

function determineTrajectory(
  indicators: MovementIndicators,
  conversationHistory: { role: string; content: string }[]
): TherapeuticTrajectory {
  const positiveScore = (indicators.deepening + indicators.integration) / 2;
  const negativeScore = (indicators.resistance + indicators.flooding + indicators.looping) / 3;

  if (positiveScore < 0.2 && negativeScore < 0.2) return 'holding';

  if (indicators.looping > 0.4) {
    const recentUserContent = conversationHistory
      .filter(t => t.role === 'user')
      .slice(-5)
      .map(t => t.content.toLowerCase());
    if (detectThematicRepetition(recentUserContent)) return 'cycling';
  }

  if (indicators.flooding > 0.4) return 'away_from_mastery';

  if (positiveScore > negativeScore + 0.1) return 'toward_mastery';
  if (negativeScore > positiveScore + 0.1) return 'away_from_mastery';

  return 'holding';
}

function detectThematicRepetition(utterances: string[]): boolean {
  if (utterances.length < 3) return false;

  const keyPhrases: Set<string>[] = utterances.map(u => {
    const phrases = new Set<string>();
    const words = u.split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].length > 3 && words[i + 1].length > 3) {
        phrases.add(`${words[i]} ${words[i + 1]}`);
      }
    }
    return phrases;
  });

  let repetitions = 0;
  for (let i = 0; i < keyPhrases.length; i++) {
    for (let j = i + 1; j < keyPhrases.length; j++) {
      for (const phrase of Array.from(keyPhrases[i])) {
        if (keyPhrases[j].has(phrase)) repetitions++;
      }
    }
  }
  return repetitions >= 3;
}

function determineSessionPosition(exchangeCount: number): SessionPosition {
  if (exchangeCount <= 3) return 'opening';
  if (exchangeCount <= 8) return 'developing';
  if (exchangeCount <= 18) return 'working';
  if (exchangeCount <= 23) return 'integrating';
  return 'closing';
}

function assessMovementQuality(
  input: TurnInput,
  indicators: MovementIndicators
): MovementQuality {
  let pace: MovementQuality['pace'] = 'steady';
  if (input.utterance.length < 50 && indicators.resistance > 0.2) pace = 'slow';
  else if (input.utterance.length < 30) pace = 'stuck';
  else if (input.utterance.length > 300 && indicators.flooding < 0.2) pace = 'rushed';

  let depth: MovementQuality['depth'] = 'moderate';
  if (indicators.deepening > 0.5) depth = 'very_deep';
  else if (indicators.deepening > 0.2) depth = 'deep';
  else if (indicators.intellectualizing > 0.3 || indicators.resistance > 0.3) depth = 'surface';

  let coherence: MovementQuality['coherence'] = 'developing';
  if (indicators.integration > 0.4) coherence = 'integrated';
  else if (indicators.integration > 0.2 && indicators.looping < 0.2) coherence = 'coherent';
  else if (indicators.looping > 0.3 || indicators.flooding > 0.3) coherence = 'fragmented';

  return { pace, depth, coherence };
}

export function getMovementRecommendations(result: MovementAssessmentResult): string[] {
  const recommendations: string[] = [];

  switch (result.trajectory) {
    case 'away_from_mastery':
      if (result.indicators.flooding > 0.3)
        recommendations.push('User may be flooded. Consider grounding or pacing interventions.');
      if (result.indicators.resistance > 0.3)
        recommendations.push('Resistance detected. Consider honoring defenses while gently exploring.');
      break;
    case 'cycling':
      recommendations.push('User appears to be cycling. Consider introducing new perspective or bodily awareness.');
      break;
    case 'holding':
      if (result.sessionPosition === 'working')
        recommendations.push('User in holding pattern during working phase. Gentle challenge may invite movement.');
      break;
    case 'toward_mastery':
      recommendations.push('Positive movement detected. Support continued exploration.');
      break;
  }

  if (result.movementQuality.depth === 'surface')
    recommendations.push('Superficial engagement: Consider inviting deeper exploration.');
  if (result.movementQuality.coherence === 'fragmented')
    recommendations.push('Fragmented narrative: Consider helping organize experience.');

  return recommendations;
}

/**
 * Heuristic anticipation assessment (fast, no Claude call).
 * Anticipation is incorporated into guidance generator's Claude prompt.
 */
function assessAnticipationHeuristic(
  input: TurnInput,
  profile: UserTherapeuticProfile
): AnticipationState {
  const utteranceLower = input.utterance.toLowerCase();
  const exchangeCount = input.exchangeCount;

  let phase: AnticipationState['timing']['phase'] = 'building';
  const waitReasons: string[] = [];
  const readyIndicators: string[] = [];

  if (exchangeCount < 5) {
    phase = 'early_elaboration';
    waitReasons.push('still in early session');
  }

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

  if (readinessScore >= 0.5) phase = 'ready';
  else if (readinessScore >= 0.3) phase = 'approaching_readiness';
  else if (exchangeCount > 10 && readinessScore < 0.1)
    waitReasons.push('user still elaborating without clear direction');

  const elaborationMarkers = ['and then', 'also', 'another thing', 'let me tell you'];
  for (const marker of elaborationMarkers) {
    if (utteranceLower.includes(marker)) {
      waitReasons.push('user still elaborating');
      if (phase === 'approaching_readiness') phase = 'building';
      break;
    }
  }

  const estimatedTurnsToReady = phase === 'ready' ? 0
    : phase === 'approaching_readiness' ? 1
    : phase === 'building' ? 3
    : 5;

  const shouldWait = phase !== 'ready' && phase !== 'moment_passed';

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

function validatePhase(phase: string): AnticipationState['timing']['phase'] {
  const valid = ['early_elaboration', 'building', 'approaching_readiness', 'ready', 'moment_passed'];
  if (valid.includes(phase)) return phase as AnticipationState['timing']['phase'];
  return 'building';
}