// server/services/sensing-layer/session-state.ts
// In-memory session state accumulation for efficient database writes

import {
  RegisterAnalysisResult,
  MovementAssessmentResult,
  TherapeuticGuidance,
  RegisterDistribution,
  Register,
  SessionPatternRecord,
  SessionHistoricalRecord,
  SessionSymbolicRecord,
  CSSStage,
  CSSSignal,
  IBMCandidate,
  IBMSignalContribution
} from './types';
import {
  TherapeuticStateVector,
  StateVectorHistory,
  createStateVectorHistory,
  pushStateVector,
  getFieldSummary
} from './state-vector';
import {
  FieldAssessmentOutput,
  buildPriorFieldSummary,
  DEFAULT_FIELD_ASSESSMENT,
} from './field-assessment';

/**
 * Accumulates session data in memory during a call
 * Only writes to database at significant moments or session end
 */
export interface SessionAccumulator {
  callId: string;
  userId: string;
  sessionId: string;
  startTime: Date;
  exchangeCount: number;

  // Aggregated register data (not every reading)
  registerReadings: Array<{
    exchange: number;
    register: Register;
    timestamp: Date;
  }>;
  registerTally: RegisterDistribution;

  // Only significant moments (not every utterance)
  significantMoments: Array<{
    exchange: number;
    type: 'css_shift' | 'pattern_detected' | 'symbolic_connection' | 'flooding' | 'breakthrough' | 'resistance' | 'critical_moment';
    description: string;
    guidance?: TherapeuticGuidance;
  }>;

  // Latest state (for real-time guidance)
  latestRegister: RegisterAnalysisResult | null;
  latestMovement: MovementAssessmentResult | null;
  latestGuidance: TherapeuticGuidance | null;

  // Session-level aggregates
  patternsThisSession: string[];
  connectionsThisSession: string[];

  // Structured profile data for end-of-call persistence
  structuredPatterns: SessionPatternRecord[];
  structuredHistorical: SessionHistoricalRecord[];
  structuredConnections: SessionSymbolicRecord[];

  // State vector history for coupling calculations
    stateVectorHistory: StateVectorHistory;

    // CSS stage tracking (three-layer architecture)
    cssSignals: CSSSignal[];              // Per-utterance signals accumulated across session
    sessionCSSStage: CSSStage;            // Session-level stage — updated at milestones only
    sessionCSSStageConfidence: number;    // Confidence in session-level stage
    lastCSSMilestoneExchange: number;     // Exchange number of last milestone assessment
    activeIBMCandidates: IBMCandidate[];

  // Field assessments — rolling store for priorFieldSummary computation
  fieldAssessments: FieldAssessmentOutput[];
  }

/**
 * Session summary type for database storage
 */
export interface SessionSummary {
  callId: string;
  userId: string;
  sessionId: string;
  startTime: Date;
  endTime: Date;
  exchangeCount: number;
  dominantRegister: Register;
  registerDistribution: RegisterDistribution;
  fluidityScore: number;
  stucknessScore: number;
  significantMoments: SessionAccumulator['significantMoments'];
  patternsDetected: string[];
  symbolicConnections: string[];
  structuredPatterns: SessionPatternRecord[];
  structuredHistorical: SessionHistoricalRecord[];
  structuredConnections: SessionSymbolicRecord[];
  finalCSSStage: string;
  finalCSSStageConfidence: number;
  finalMovementQuality: {
    pace: string;
    depth: string;
    coherence: string;
  };
  fieldSummary: {
    averageMomentum: number;
    registerTrend: { Real: number; Imaginary: number; Symbolic: number };
    peakSymbolicActivation: number;
    cssProgressionDirection: 'advancing' | 'stable' | 'retreating';
    dominantVelocityPattern: string;
  } | null;
}

/**
 * In-memory store for active sessions
 */
const activeSessions = new Map<string, SessionAccumulator>();

/**
 * Initialize a new session accumulator
 */
export function initializeSession(
  callId: string,
  userId: string,
  sessionId: string,
  priorCSSStage?: CSSStage | null,
  priorCSSStageConfidence?: number | null
): SessionAccumulator {
  const accumulator: SessionAccumulator = {
    callId,
    userId,
    sessionId,
    startTime: new Date(),
    exchangeCount: 0,
    registerReadings: [],
    registerTally: { Real: 0, Imaginary: 0, Symbolic: 0 },
    significantMoments: [],
    latestRegister: null,
    latestMovement: null,
    latestGuidance: null,
    patternsThisSession: [],
    connectionsThisSession: [],
    structuredPatterns: [],
    structuredHistorical: [],
    structuredConnections: [],
    stateVectorHistory: createStateVectorHistory(10),
      cssSignals: [],
      sessionCSSStage: priorCSSStage ?? 'pointed_origin',
      sessionCSSStageConfidence: priorCSSStageConfidence ?? 0.3,
      lastCSSMilestoneExchange: 0,
      activeIBMCandidates: [],
      fieldAssessments: [],
  };

  activeSessions.set(callId, accumulator);
  console.log(`📊 [SessionState] Initialized session for call ${callId}`);

  return accumulator;
}

/**
 * Get current session state (returns null if not initialized)
 */
export function getSessionState(callId: string): SessionAccumulator | null {
  return activeSessions.get(callId) || null;
}

/**
 * Update session state with new sensing data
 * This is called every turn but doesn't write to DB
 */
export function updateSessionState(
  callId: string,
  register: RegisterAnalysisResult,
  movement: MovementAssessmentResult,
  guidance: TherapeuticGuidance
): SessionAccumulator | null {
  const session = activeSessions.get(callId);
  if (!session) {
    console.warn(`⚠️ [SessionState] No session found for call ${callId}`);
    return null;
  }

  session.exchangeCount++;

  // Record register reading
  session.registerReadings.push({
    exchange: session.exchangeCount,
    register: register.currentRegister,
    timestamp: new Date()
  });

  // Update register tally
  session.registerTally.Real += register.registerDistribution.Real;
  session.registerTally.Imaginary += register.registerDistribution.Imaginary;
  session.registerTally.Symbolic += register.registerDistribution.Symbolic;

  // Update latest state
  session.latestRegister = register;
  session.latestMovement = movement;
  session.latestGuidance = guidance;

  return session;
}

/**
 * Record a significant moment (these get stored to DB)
 */
export function recordSignificantMoment(
  callId: string,
  type: SessionAccumulator['significantMoments'][0]['type'],
  description: string,
  guidance?: TherapeuticGuidance
): void {
  const session = activeSessions.get(callId);
  if (!session) {
    console.warn(`⚠️ [SessionState] No session found for call ${callId}`);
    return;
  }

  session.significantMoments.push({
    exchange: session.exchangeCount,
    type,
    description,
    guidance
  });

  console.log(`⭐ [SessionState] Recorded significant moment: ${type} - ${description}`);
}

/**
 * Record a pattern detection
 */
export function recordPatternDetected(callId: string, patternDescription: string): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  if (!session.patternsThisSession.includes(patternDescription)) {
    session.patternsThisSession.push(patternDescription);
    console.log(`🔄 [SessionState] Recorded pattern: ${patternDescription}`);
  }
}

/**
 * Record a symbolic connection
 */
export function recordSymbolicConnection(callId: string, connectionDescription: string): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  if (!session.connectionsThisSession.includes(connectionDescription)) {
    session.connectionsThisSession.push(connectionDescription);
    console.log(`🔗 [SessionState] Recorded connection: ${connectionDescription}`);
  }
}

/**
 * Record a structured pattern for end-of-call profile persistence.
 * Deduplicates within the session by normalized description.
 * Keeps the higher-confidence version and merges explicit identification.
 */
export function recordStructuredPattern(callId: string, record: SessionPatternRecord): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  const normalized = record.description.toLowerCase().trim();
  const existing = session.structuredPatterns.find(
    p => p.description.toLowerCase().trim() === normalized
  );

  if (existing) {
    if (record.confidence > existing.confidence) {
      existing.confidence = record.confidence;
      existing.evidence = record.evidence || existing.evidence;
    }
    if (record.userExplicitlyIdentified) {
      existing.userExplicitlyIdentified = true;
    }
  } else {
    session.structuredPatterns.push({ ...record });
  }
}

/**
 * Record structured historical material for end-of-call profile persistence.
 * Deduplicates within the session by normalized content.
 * Merges higher-confidence or richer data into existing records.
 */
export function recordStructuredHistorical(callId: string, record: SessionHistoricalRecord): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  const normalized = record.content.toLowerCase().trim();
  const existing = session.structuredHistorical.find(
    h => h.content.toLowerCase().trim() === normalized
  );

  if (existing) {
    if (record.confidence > existing.confidence) {
      existing.confidence = record.confidence;
    }
    if (record.contextNotes.length > existing.contextNotes.length) {
      existing.contextNotes = record.contextNotes;
    }
    const mergedFigures = Array.from(new Set([...existing.relatedFigures, ...record.relatedFigures]));
    existing.relatedFigures = mergedFigures;
  } else {
    session.structuredHistorical.push({ ...record });
  }
}

/**
 * Record a structured symbolic connection for end-of-call profile persistence.
 * Deduplicates within the session by normalized symbolicConnection.
 */
export function recordStructuredConnection(callId: string, record: SessionSymbolicRecord): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  const normalized = record.symbolicConnection.toLowerCase().trim();
  const exists = session.structuredConnections.some(
    c => c.symbolicConnection.toLowerCase().trim() === normalized
  );

  if (!exists) {
    session.structuredConnections.push({ ...record });
  }
}

/**
 * Record a state vector in the session history
 */
export function recordStateVector(callId: string, vector: TherapeuticStateVector): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  pushStateVector(session.stateVectorHistory, vector);
}

/**
 * Get previous state vectors for coupling calculations
 */
export function getPreviousVectors(callId: string): TherapeuticStateVector[] {
  const session = activeSessions.get(callId);
  if (!session) return [];
  return session.stateVectorHistory.vectors;
}

/**
 * Determine if current state represents a significant moment worth recording
 */
export function isSignificantMoment(
  movement: MovementAssessmentResult,
  previousMovement: MovementAssessmentResult | null
): { isSignificant: boolean; type?: SessionAccumulator['significantMoments'][0]['type']; description?: string } {
  // CSS stage shift
  if (previousMovement && movement.cssStage !== previousMovement.cssStage) {
    return {
      isSignificant: true,
      type: 'css_shift',
      description: `CSS stage shifted from ${previousMovement.cssStage} to ${movement.cssStage}`
    };
  }

  // Flooding detected
  if (movement.indicators.flooding > 0.7) {
    return {
      isSignificant: true,
      type: 'flooding',
      description: `Flooding detected (${Math.round(movement.indicators.flooding * 100)}%)`
    };
  }

  // Breakthrough moment (high integration + deepening)
  if (movement.indicators.integration > 0.7 && movement.indicators.deepening > 0.6) {
    return {
      isSignificant: true,
      type: 'breakthrough',
      description: `Breakthrough moment - integration: ${Math.round(movement.indicators.integration * 100)}%, deepening: ${Math.round(movement.indicators.deepening * 100)}%`
    };
  }

  // High resistance
  if (movement.indicators.resistance > 0.7) {
    return {
      isSignificant: true,
      type: 'resistance',
      description: `High resistance detected (${Math.round(movement.indicators.resistance * 100)}%)`
    };
  }

  return { isSignificant: false };
}

/**
 * Get session summary for end-of-call database write
 */
export function getSessionSummary(callId: string): SessionSummary | null {
  const session = activeSessions.get(callId);
  if (!session) {
    console.warn(`⚠️ [SessionState] No session found for call ${callId}`);
    return null;
  }

  // Calculate dominant register from field assessments (semantic path)
  // Falls back to registerTally (legacy keyword path) if no field assessments exist
  let dominantRegister: Register = 'Imaginary';
  let registerDistribution: RegisterDistribution;

  if (session.fieldAssessments.length > 0) {
    const tally = { Real: 0, Imaginary: 0, Symbolic: 0 };
    for (const fa of session.fieldAssessments) {
      tally[fa.register.current]++;
    }
    const total = session.fieldAssessments.length;
    if (tally.Real >= tally.Imaginary && tally.Real >= tally.Symbolic) {
      dominantRegister = 'Real';
    } else if (tally.Symbolic >= tally.Imaginary) {
      dominantRegister = 'Symbolic';
    }
    registerDistribution = {
      Real: tally.Real / total,
      Imaginary: tally.Imaginary / total,
      Symbolic: tally.Symbolic / total,
    };
  } else {
    const totalRegister = session.registerTally.Real + session.registerTally.Imaginary + session.registerTally.Symbolic;
    if (session.registerTally.Real >= session.registerTally.Imaginary &&
        session.registerTally.Real >= session.registerTally.Symbolic) {
      dominantRegister = 'Real';
    } else if (session.registerTally.Symbolic >= session.registerTally.Imaginary) {
      dominantRegister = 'Symbolic';
    }
    registerDistribution = {
      Real: totalRegister > 0 ? session.registerTally.Real / totalRegister : 0.33,
      Imaginary: totalRegister > 0 ? session.registerTally.Imaginary / totalRegister : 0.33,
      Symbolic: totalRegister > 0 ? session.registerTally.Symbolic / totalRegister : 0.34,
    };
  }

  // Calculate fluidity score based on register changes
  const fluidityScore = calculateFluidityScore(session.registerReadings);

  // Calculate stuckness score
  const stucknessScore = 1 - fluidityScore;

  return {
    callId: session.callId,
    userId: session.userId,
    sessionId: session.sessionId,
    startTime: session.startTime,
    endTime: new Date(),
    exchangeCount: session.exchangeCount,
    dominantRegister,
    registerDistribution,
    fluidityScore,
    stucknessScore,
    significantMoments: session.significantMoments,
    patternsDetected: session.patternsThisSession,
    symbolicConnections: session.connectionsThisSession,
    structuredPatterns: session.structuredPatterns,
    structuredHistorical: session.structuredHistorical,
    structuredConnections: session.structuredConnections,
    finalCSSStage: session.sessionCSSStage,
    finalCSSStageConfidence: session.sessionCSSStageConfidence,
    finalMovementQuality: session.latestMovement?.movementQuality || { pace: 'steady', depth: 'moderate', coherence: 'developing' },
    fieldSummary: session.stateVectorHistory.vectors.length > 0
      ? getFieldSummary(session.stateVectorHistory)
      : null
  };
}

/**
 * Calculate fluidity score from register readings
 */
function calculateFluidityScore(readings: SessionAccumulator['registerReadings']): number {
  if (readings.length < 2) return 0.5;

  let transitions = 0;
  for (let i = 1; i < readings.length; i++) {
    if (readings[i].register !== readings[i - 1].register) {
      transitions++;
    }
  }

  // Normalize: ideal fluidity is about 30-50% transitions
  const transitionRate = transitions / (readings.length - 1);

  // Too few transitions = stuck, too many = chaotic
  if (transitionRate < 0.2) return transitionRate * 2.5; // 0-0.5 range
  if (transitionRate > 0.6) return 1 - (transitionRate - 0.6); // Penalize chaos
  return 0.5 + (transitionRate - 0.2) * 1.25; // Sweet spot: 0.5-1.0
}

/**
 * Clear session from memory (call after writing to DB)
 */
export function clearSession(callId: string): void {
  activeSessions.delete(callId);
  console.log(`🗑️ [SessionState] Cleared session for call ${callId}`);
}

/**
 * Get count of active sessions (for monitoring)
 */
// ─── IBM Candidate Management ────────────────────────────────────────────────
const IBM_WEIGHTED_THRESHOLD = 2.0;
const IBM_MIN_SIGNAL_STRENGTH = 0.4;
const IBM_MIN_QUALIFYING_SIGNALS = 2;
const IBM_CONSECUTIVE_ALIGNMENT_CLEAR = 2;

export function computeIBMSignalStrength(
  resistance: number,
  intellectualizing: number,
  contradictionStrength: number
): number {
  return Math.min(1,
    contradictionStrength *
    (1 + (resistance * 0.2) + (intellectualizing * 0.1))
  );
}

function evaluateCandidateViability(
  candidate: IBMCandidate,
  currentRegister: 'Real' | 'Imaginary' | 'Symbolic'
): void {
  const qualifyingSignals = candidate.confirmingSignals.filter(
    s => s.signalStrength >= IBM_MIN_SIGNAL_STRENGTH
  );
  candidate.minimumHoldSatisfied = qualifyingSignals.length >= IBM_MIN_QUALIFYING_SIGNALS;

  const registerViable = currentRegister === 'Imaginary' || currentRegister === 'Symbolic';
  candidate.registerViable = registerViable;
  candidate.viableRegister = registerViable
    ? currentRegister as 'Imaginary' | 'Symbolic'
    : null;

  candidate.thresholdCrossed = candidate.weightedAccumulation >= IBM_WEIGHTED_THRESHOLD;

  candidate.namingViable =
    candidate.minimumHoldSatisfied &&
    candidate.registerViable &&
    candidate.thresholdCrossed;

  if (candidate.namingViable) {
    candidate.status = 'viable';
  }
}

export function createIBMCandidate(
  callId: string,
  hypothesis: string,
  statedPosition: string,
  exchange: number,
  initialSignalStrength: number,
  evidence: string,
  resistanceValue: number,
  intellectualizingValue: number
): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  const signalBasis: IBMSignalContribution['signalBasis'] =
    resistanceValue > 0 && intellectualizingValue > 0 ? 'composite'
    : resistanceValue >= intellectualizingValue ? 'resistance'
    : 'intellectualizing';

  const candidate: IBMCandidate = {
    id: `ibm-${exchange}-${Date.now()}`,
    hypothesis,
    statedPosition,
    candidateExchange: exchange,
    confirmingSignals: initialSignalStrength > 0 ? [{
      exchange,
      evidenceStatement: evidence,
      signalStrength: initialSignalStrength,
      signalBasis
    }] : [],
    consecutiveAlignmentTurns: 0,
    weightedAccumulation: initialSignalStrength,
    namingViable: false,
    minimumHoldSatisfied: false,
    registerViable: false,
    thresholdCrossed: false,
    viableRegister: null,
    status: 'accumulating'
  };

  session.activeIBMCandidates.push(candidate);
  console.log(`🔲 [IBM] New candidate created at exchange ${exchange}: "${hypothesis.substring(0, 60)}"`);
}

export function confirmIBMCandidates(
  callId: string,
  exchange: number,
  signalStrength: number,
  evidence: string,
  currentRegister: 'Real' | 'Imaginary' | 'Symbolic'
): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  session.activeIBMCandidates
    .filter(c => c.status === 'accumulating' || c.status === 'viable')
    .forEach(candidate => {
      candidate.consecutiveAlignmentTurns = 0;
      candidate.confirmingSignals.push({
        exchange,
        evidenceStatement: evidence,
        signalStrength,
        signalBasis: 'composite'
      });
      candidate.weightedAccumulation += signalStrength;
      evaluateCandidateViability(candidate, currentRegister);
    });
}

export function processIBMAlignment(
  callId: string,
  signalStrengthEquivalent: number,
  currentRegister: 'Real' | 'Imaginary' | 'Symbolic'
): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  session.activeIBMCandidates
    .filter(c => c.status === 'accumulating' || c.status === 'viable')
    .forEach(candidate => {
      candidate.consecutiveAlignmentTurns++;
      if (candidate.consecutiveAlignmentTurns >= IBM_CONSECUTIVE_ALIGNMENT_CLEAR) {
        candidate.status = 'resolved_inconclusive';
        console.log(`🔲 [IBM] Candidate resolved inconclusive (sustained alignment): "${candidate.hypothesis.substring(0, 60)}"`);
      } else {
        candidate.weightedAccumulation = Math.max(
          0,
          candidate.weightedAccumulation - signalStrengthEquivalent
        );
        evaluateCandidateViability(candidate, currentRegister);
        console.log(`🔲 [IBM] Alignment turn — accumulation reduced to ${candidate.weightedAccumulation.toFixed(2)}`);
      }
    });
}

export function resolveIBMClientInitiated(callId: string): void {
  const session = activeSessions.get(callId);
  if (!session) return;

  session.activeIBMCandidates
    .filter(c => c.status === 'accumulating' || c.status === 'viable')
    .forEach(candidate => {
      candidate.status = 'resolved_client';
      candidate.clientInitiated = true;
      console.log(`🔲 [IBM] Candidate resolved — client named contradiction: "${candidate.hypothesis.substring(0, 60)}"`);
    });
}

export function getActiveIBMCandidates(callId: string): IBMCandidate[] {
  const session = activeSessions.get(callId);
  if (!session) return [];
  return session.activeIBMCandidates.filter(
    c => c.status === 'accumulating' || c.status === 'viable' || c.status === 'resolved_client'
  );
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}
/**
 * Record per-utterance CSS signals into session accumulator.
 * Called every turn from sensing-layer/index.ts after movement assessment.
 */
export function recordCSSSignals(callId: string, signals: CSSSignal[]): void {
  const session = activeSessions.get(callId);
  if (!session || signals.length === 0) return;
  session.cssSignals.push(...signals);
}

/**
 * Assess session-level CSS stage from accumulated signals.
 * Called at milestone exchanges (5, 10, 15, 20) — not every turn.
 *
 * CLINICAL BASIS:
 * - Signals weighted with recency bias (most recent third = 3x weight)
 * - Advancement requires minimum score threshold to prevent noise-driven jumps
 * - Maximum one stage advance per milestone (hysteresis)
 * - Stage can retreat freely on sustained contradictory signals
 */
export function assessSessionCSSStage(callId: string): { stage: CSSStage; confidence: number } {
  const session = activeSessions.get(callId);
  if (!session) return { stage: 'pointed_origin', confidence: 0.3 };
  if (session.cssSignals.length === 0) {
    return { stage: session.sessionCSSStage, confidence: session.sessionCSSStageConfidence };
  }

  const stageOrder: CSSStage[] = [
    'pointed_origin', 'focus_bind', 'suspension',
    'gesture_toward', 'completion', 'terminal'
  ];

  // Weight signals with recency bias
  const totalSignals = session.cssSignals.length;
  const stageScores: Record<CSSStage, number> = {
    pointed_origin: 0, focus_bind: 0, suspension: 0,
    gesture_toward: 0, completion: 0, terminal: 0
  };

  for (let i = 0; i < totalSignals; i++) {
    const signal = session.cssSignals[i];
    const recencyWeight = i >= totalSignals * 0.67 ? 3
      : i >= totalSignals * 0.33 ? 1.5
      : 1;
    stageScores[signal.stage] += signal.confidence * recencyWeight;
  }

  // Find highest scoring stage
  let topStage: CSSStage = session.sessionCSSStage;
  let topScore = 0;
  for (const [stage, score] of Object.entries(stageScores) as [CSSStage, number][]) {
    if (score > topScore) {
      topScore = score;
      topStage = stage;
    }
  }

  const currentIndex = stageOrder.indexOf(session.sessionCSSStage);
  const topIndex = stageOrder.indexOf(topStage);

  // Hysteresis: advance at most one stage per milestone
  if (topIndex > currentIndex + 1) {
    topStage = stageOrder[currentIndex + 1];
  }

  // Require minimum score to advance (prevents noise-driven advancement)
  const ADVANCEMENT_THRESHOLD = 0.8;
  if (topIndex > currentIndex && topScore < ADVANCEMENT_THRESHOLD) {
    topStage = session.sessionCSSStage;
  }

  // Confidence from margin over second-best score
  const scores = Object.values(stageScores);
  const maxScore = Math.max(...scores);
  const secondMax = Math.max(...scores.filter(s => s !== maxScore));
  const confidence = maxScore > 0
    ? Math.min(0.9, 0.4 + (maxScore - secondMax) * 0.3)
    : 0.3;

  // Persist back to session
  session.sessionCSSStage = topStage;
  session.sessionCSSStageConfidence = confidence;
  session.lastCSSMilestoneExchange = session.exchangeCount;

  console.log(`🎯 [SessionState] CSS stage assessed at exchange ${session.exchangeCount}: ${topStage} (confidence: ${confidence.toFixed(2)}, signals: ${totalSignals})`);

  return { stage: topStage, confidence };
}

/**
 * Get current session-level CSS stage without triggering reassessment.
 * Used by state-vector.ts and index.ts orchestration.
 */
export function getSessionCSSStage(callId: string): { stage: CSSStage; confidence: number } {
  const session = activeSessions.get(callId);
  return {
    stage: session?.sessionCSSStage ?? 'pointed_origin',
    confidence: session?.sessionCSSStageConfidence ?? 0.3
  };
}

/**
 * Store a completed field assessment in the session accumulator.
 * Called after runFieldAssessment completes (fires in background during agent speech).
 * Also feeds CSS signals into the existing accumulator and drives IBM candidate logic.
 */
export function recordFieldAssessment(
  callId: string,
  assessment: FieldAssessmentOutput,
  exchangeCount: number
): void {
  const session = activeSessions.get(callId);
  if (!session) return;
  session.exchangeCount++;
  session.fieldAssessments.push(assessment);
  // Feed CSS signals into the existing accumulator
  if (assessment.css_signals.length > 0) {
    session.cssSignals.push(...assessment.css_signals.map(s => ({
      stage: s.stage,
      confidence: s.confidence,
      indicatorType: 'field_assessment' as const,
      evidence: s.functional_description,
      exchangeNumber: exchangeCount,
    })));
  }

  // IBM candidate management from field assessment
  if (assessment.ibm.client_named) {
    resolveIBMClientInitiated(callId);
  } else if (assessment.ibm.behavioral_alignment_strength < 0.3 && !assessment.ibm.contradiction_present) {
    // Strong disconfirmation — reduce accumulation
    processIBMAlignment(callId, 1 - assessment.ibm.behavioral_alignment_strength, assessment.register.current);
  } else if (assessment.ibm.contradiction_present && assessment.ibm.contradiction_strength > 0) {
    const existingCandidates = getActiveIBMCandidates(callId);
    if (existingCandidates.length === 0 && assessment.ibm.hypothesis) {
      createIBMCandidate(
        callId,
        assessment.ibm.hypothesis,
        assessment.ibm.stated_position || '',
        exchangeCount,
        assessment.ibm.contradiction_strength,
        assessment.ibm.evidence,
        0,
        0
      );
    } else if (existingCandidates.length > 0) {
      confirmIBMCandidates(
        callId,
        exchangeCount,
        assessment.ibm.contradiction_strength,
        assessment.ibm.evidence,
        assessment.register.current
      );
    }
  }

  console.log(`🔬 [FieldAssessment] Recorded for exchange ${exchangeCount} — register: ${assessment.register.current}, IBM strength: ${assessment.ibm.contradiction_strength.toFixed(2)}, critical: ${assessment.critical_moment}`);

  if (assessment.critical_moment && assessment.critical_moment_reason) {
    recordSignificantMoment(
      callId,
      'critical_moment',
      assessment.critical_moment_reason
    );
  }
}

/**
 * Get the most recent field assessment for a call.
 * Returns DEFAULT_FIELD_ASSESSMENT if none exists yet (first turn).
 */
export function getLatestFieldAssessment(callId: string): FieldAssessmentOutput {
  const session = activeSessions.get(callId);
  if (!session || session.fieldAssessments.length === 0) {
    return DEFAULT_FIELD_ASSESSMENT;
  }
  return session.fieldAssessments[session.fieldAssessments.length - 1];
}

/**
 * Compute the prior field summary string for injection into the field assessment prompt.
 * Reads from stored field assessments in the session accumulator.
 * Returns 'none' on the first turn when no prior assessments exist.
 */
export function getPriorFieldSummary(callId: string): string {
  const session = activeSessions.get(callId);
  if (!session || session.fieldAssessments.length === 0) {
    return 'none';
  }
  return buildPriorFieldSummary(session.fieldAssessments);
}