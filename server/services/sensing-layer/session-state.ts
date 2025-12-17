// server/services/sensing-layer/session-state.ts
// In-memory session state accumulation for efficient database writes

import {
  RegisterAnalysisResult,
  MovementAssessmentResult,
  TherapeuticGuidance,
  RegisterDistribution,
  Register
} from './types';

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
    type: 'css_shift' | 'pattern_detected' | 'symbolic_connection' | 'flooding' | 'breakthrough' | 'resistance';
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
}

/**
 * In-memory store for active sessions
 */
const activeSessions = new Map<string, SessionAccumulator>();

/**
 * Initialize a new session accumulator
 */
export function initializeSession(callId: string, userId: string, sessionId: string): SessionAccumulator {
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
    connectionsThisSession: []
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

  const totalRegister = session.registerTally.Real + session.registerTally.Imaginary + session.registerTally.Symbolic;

  // Calculate dominant register
  let dominantRegister: Register = 'Imaginary';
  if (session.registerTally.Real >= session.registerTally.Imaginary &&
      session.registerTally.Real >= session.registerTally.Symbolic) {
    dominantRegister = 'Real';
  } else if (session.registerTally.Symbolic >= session.registerTally.Imaginary) {
    dominantRegister = 'Symbolic';
  }

  // Calculate register distribution percentages
  const registerDistribution: RegisterDistribution = {
    Real: totalRegister > 0 ? session.registerTally.Real / totalRegister : 0.33,
    Imaginary: totalRegister > 0 ? session.registerTally.Imaginary / totalRegister : 0.33,
    Symbolic: totalRegister > 0 ? session.registerTally.Symbolic / totalRegister : 0.34
  };

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
    finalCSSStage: session.latestMovement?.cssStage || 'pointed_origin',
    finalMovementQuality: session.latestMovement?.movementQuality || { pace: 'steady', depth: 'moderate', coherence: 'developing' }
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
export function getActiveSessionCount(): number {
  return activeSessions.size;
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
  finalCSSStage: string;
  finalMovementQuality: {
    pace: string;
    depth: string;
    coherence: string;
  };
}
