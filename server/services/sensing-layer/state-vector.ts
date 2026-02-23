// server/services/sensing-layer/state-vector.ts
// Therapeutic State Vector — couples sensing module outputs into unified dynamics

import {
  RegisterAnalysisResult,
  MovementAssessmentResult,
  PatternDetectionResult,
  SymbolicMappingResult,
  MovementIndicators,
  RegisterDistribution,
  Register,
  CSSStage
} from './types';

/**
 * The Therapeutic State Vector — a unified representation of the
 * user's current therapeutic state across all sensing dimensions.
 *
 * Unlike the OSR (which bundles four independent results),
 * the state vector models COUPLING between dimensions:
 * - Register shifts influence movement scores
 * - Symbolic activation influences CSS stage assessment
 * - Pattern density influences register interpretation
 * - Movement trajectory feeds back to pattern significance
 */
export interface TherapeuticStateVector {
  // Raw module outputs (preserved unchanged)
  raw: {
    patterns: PatternDetectionResult;
    register: RegisterAnalysisResult;
    symbolic: SymbolicMappingResult;
    movement: MovementAssessmentResult;
  };

  // Coupled/adjusted scores (replace raw scores for guidance)
  coupled: {
    movementIndicators: MovementIndicators;
    registerDistribution: RegisterDistribution;
    cssStage: CSSStage;
    cssStageConfidence: number;
    symbolicActivation: number;        // 0-1 overall symbolic heat
    therapeuticMomentum: number;        // -1 to 1, negative = retreating, positive = progressing
    phaseTransitionProximity: number;   // 0-1, how close to a CSS stage shift
  };

  // Rates of change (how fast things are moving)
  // Computed by comparing current coupled values to previous exchange's coupled values
  velocity: {
    registerShiftRate: number;          // How quickly register is changing (0-1)
    deepeningAcceleration: number;      // Is deepening speeding up or slowing? (-1 to 1)
    resistanceTrajectory: number;       // Is resistance rising or falling? (-1 to 1)
    symbolicActivationRate: number;     // Is symbolic material heating up? (-1 to 1)
  };

  // Metadata
  exchangeNumber: number;
  timestamp: Date;
}

/**
 * History buffer for computing velocity/rates of change.
 * Stored in session state per call.
 */
export interface StateVectorHistory {
  vectors: TherapeuticStateVector[];
  maxHistory: number;  // Keep last N vectors (default 10)
}

/**
 * Create the coupled state vector from raw module outputs.
 * This is where the PDE coupling happens.
 *
 * VELOCITY NOTE: Velocity compares current coupled values to the
 * PREVIOUS exchange's coupled values. This means velocity reflects
 * the same "reality" that guidance acts on, not the raw sensor readings.
 * The velocity calculation runs AFTER coupling so it can use coupled outputs.
 */
export function coupleStateVector(
  patterns: PatternDetectionResult,
  register: RegisterAnalysisResult,
  symbolic: SymbolicMappingResult,
  movement: MovementAssessmentResult,
  previousVectors: TherapeuticStateVector[],
  exchangeNumber: number
): TherapeuticStateVector {

  // === COUPLING RULE 1: Register shift → Movement adjustment ===
  const coupledMovement = coupleRegisterToMovement(register, movement);

  // === COUPLING RULE 2: Symbolic activation → CSS stage adjustment ===
  const symbolicActivation = calculateSymbolicActivation(symbolic);
  const { coupledCSSStage, coupledCSSConfidence, phaseTransitionProximity } =
    coupleSymbolicToCSS(symbolic, movement, coupledMovement, symbolicActivation, previousVectors);

  // === COUPLING RULE 3: Pattern density → Register interpretation ===
  const coupledRegister = couplePatternToRegister(patterns, register);

  // === COUPLING RULE 4: Movement trajectory → Therapeutic momentum ===
  const therapeuticMomentum = calculateMomentum(coupledMovement, movement.trajectory);

  // === VELOCITY: Compare current COUPLED values to previous COUPLED values ===
  // This runs after coupling so velocity reflects the coupled "reality"
  const velocity = calculateVelocity(
    coupledRegister, coupledMovement, symbolicActivation, previousVectors
  );

  return {
    raw: { patterns, register, symbolic, movement },
    coupled: {
      movementIndicators: coupledMovement,
      registerDistribution: coupledRegister,
      cssStage: coupledCSSStage,
      cssStageConfidence: coupledCSSConfidence,
      symbolicActivation,
      therapeuticMomentum,
      phaseTransitionProximity
    },
    velocity,
    exchangeNumber,
    timestamp: new Date()
  };
}

// ============================================================
// COUPLING FUNCTIONS
// ============================================================

/**
 * COUPLING RULE 1: Register shifts automatically adjust movement indicators.
 *
 * Moving from Imaginary to Real IS deepening — even without "deepening keywords."
 * Moving from Real to Symbolic IS integration — making meaning from felt sense.
 * Fluid register = reduced looping. Stuck register = increased looping risk.
 */
function coupleRegisterToMovement(
  register: RegisterAnalysisResult,
  movement: MovementAssessmentResult
): MovementIndicators {
  const coupled = { ...movement.indicators };

  // Register movement toward Real = deepening boost
  if (register.registerMovement === 'toward_real') {
    coupled.deepening = Math.min(1, coupled.deepening + 0.15);
    coupled.intellectualizing = Math.max(0, coupled.intellectualizing - 0.1);
  }

  // Register movement toward Imaginary = narrative elaboration (not deepening)
  if (register.registerMovement === 'toward_imaginary' && register.stucknessScore > 0.4) {
    coupled.deepening = Math.max(0, coupled.deepening - 0.05);
  }

  // Register movement toward Symbolic from Real = integration (meaning-making after body)
  if (register.registerMovement === 'toward_symbolic' &&
      register.registerDistribution.Real > 0.2) {
    coupled.integration = Math.min(1, coupled.integration + 0.1);
  }

  // Fluid register movement = reduced looping, slight integration boost
  if (register.registerMovement === 'fluid') {
    coupled.looping = Math.max(0, coupled.looping - 0.15);
    coupled.integration = Math.min(1, coupled.integration + 0.05);
  }

  // Static register movement + high stuckness = increased looping risk
  if (register.registerMovement === 'static' && register.stucknessScore > 0.5) {
    coupled.looping = Math.min(1, coupled.looping + 0.12);
  }

  // High stuckness in any register = increased looping risk
  if (register.stucknessScore > 0.6) {
    coupled.looping = Math.min(1, coupled.looping + 0.1);
  }

  // Stuck in Imaginary specifically = narrative elaboration, not deepening
  if (register.currentRegister === 'Imaginary' && register.stucknessScore > 0.5) {
    coupled.deepening = Math.max(0, coupled.deepening - 0.1);
  }

  return coupled;
}

/**
 * COUPLING RULE 2: Symbolic activation adjusts CSS stage assessment.
 *
 * CSS stage shifts are phase transitions — they emerge when multiple
 * dimensions align. High symbolic activation + fluidity + deepening =
 * approaching a transition. High resistance = retreating from one.
 *
 * HYSTERESIS: Stage bumps require high proximity for 2 consecutive
 * exchanges to prevent flapping.
 */
function coupleSymbolicToCSS(
  symbolic: SymbolicMappingResult,
  movement: MovementAssessmentResult,
  coupledMovement: MovementIndicators,
  symbolicActivation: number,
  previousVectors: TherapeuticStateVector[]
): {
  coupledCSSStage: CSSStage;
  coupledCSSConfidence: number;
  phaseTransitionProximity: number;
} {
  let coupledStage = movement.cssStage;
  let coupledConfidence = movement.cssStageConfidence;

  // Calculate phase transition proximity from multiple signals
  const transitionSignals: number[] = [];
  transitionSignals.push(symbolicActivation);
  transitionSignals.push(coupledMovement.integration);
  transitionSignals.push(coupledMovement.deepening);
  if (symbolic.awarenessShift) {
    transitionSignals.push(0.8);
  }
  transitionSignals.push(1 - coupledMovement.resistance);

  const phaseTransitionProximity = transitionSignals.length > 0
    ? transitionSignals.reduce((a, b) => a + b, 0) / transitionSignals.length
    : 0;

  const stageOrder: CSSStage[] = [
    'pointed_origin', 'focus_bind', 'suspension',
    'gesture_toward', 'completion', 'terminal'
  ];
  const currentIndex = stageOrder.indexOf(coupledStage);

  // FORWARD BUMP with hysteresis: proximity must be high for 2 consecutive exchanges
  if (phaseTransitionProximity > 0.7 && coupledConfidence < 0.7 &&
      currentIndex < stageOrder.length - 1) {

    // Check hysteresis: was previous vector also high proximity?
    const prevHighProximity = previousVectors.length > 0 &&
      previousVectors[previousVectors.length - 1].coupled.phaseTransitionProximity > 0.6;

    if (prevHighProximity) {
      coupledStage = stageOrder[currentIndex + 1];
      coupledConfidence = Math.min(coupledConfidence + 0.15, 0.75);
    }
    // If no previous high proximity, don't bump yet — wait for confirmation
  }

  // BACKWARD PULL: high resistance pulls stage back (no hysteresis needed)
  if (movement.indicators.resistance > 0.6 && phaseTransitionProximity < 0.4) {
    if (currentIndex > 0) {
      coupledStage = stageOrder[currentIndex - 1];
      coupledConfidence = Math.max(coupledConfidence - 0.1, 0.3);
    }
  }

  return { coupledCSSStage: coupledStage, coupledCSSConfidence: coupledConfidence, phaseTransitionProximity };
}

/**
 * COUPLING RULE 3: Pattern density adjusts register distribution.
 *
 * Multiple patterns firing simultaneously = therapeutically dense material.
 * The register reading should reflect that symbolic-level activity is present
 * even if the user isn't using "pattern recognition" keywords.
 */
function couplePatternToRegister(
  patterns: PatternDetectionResult,
  register: RegisterAnalysisResult
): RegisterDistribution {
  const coupled = { ...register.registerDistribution };

  const patternDensity = patterns.activePatterns.length + (patterns.emergingPatterns.length * 0.5);

  if (patternDensity >= 2) {
    coupled.Symbolic = Math.min(1, coupled.Symbolic + (patternDensity * 0.05));

    if (register.currentRegister === 'Imaginary') {
      coupled.Symbolic = Math.min(1, coupled.Symbolic + 0.05);
      coupled.Imaginary = Math.max(0, coupled.Imaginary - 0.05);
    }

    // Normalize to sum to 1
    const total = coupled.Real + coupled.Imaginary + coupled.Symbolic;
    if (total > 0) {
      coupled.Real /= total;
      coupled.Imaginary /= total;
      coupled.Symbolic /= total;
    }
  }

  return coupled;
}

/**
 * Calculate overall symbolic activation from symbolic mapping results
 */
function calculateSymbolicActivation(symbolic: SymbolicMappingResult): number {
  let activation = 0;

  activation += symbolic.activeMappings.length * 0.15;
  activation += symbolic.potentialConnections.length * 0.08;

  if (symbolic.awarenessShift) {
    activation += 0.25;
  }

  if (symbolic.generativeInsight?.currentElaboration) {
    activation += symbolic.generativeInsight.currentElaboration.symbolicWeight * 0.2;
  }

  if (symbolic.readyToSurface) {
    activation += 0.2;
  }

  return Math.min(1, activation);
}

/**
 * Calculate therapeutic momentum from coupled movement and trajectory
 */
function calculateMomentum(
  coupledMovement: MovementIndicators,
  trajectory: string
): number {
  const positive = (coupledMovement.deepening + coupledMovement.integration) / 2;
  const negative = (coupledMovement.resistance + coupledMovement.flooding + coupledMovement.looping) / 3;

  let momentum = positive - negative;

  if (trajectory === 'toward_mastery') momentum = Math.min(1, momentum + 0.1);
  if (trajectory === 'away_from_mastery') momentum = Math.max(-1, momentum - 0.1);
  if (trajectory === 'cycling') momentum *= 0.5;

  return Math.max(-1, Math.min(1, momentum));
}

/**
 * Calculate velocity — rates of change between exchanges.
 *
 * CRITICAL: This compares CURRENT COUPLED values to PREVIOUS COUPLED values.
 * This ensures velocity reflects the same "reality" that guidance acts on.
 *
 * Parameters receive the current exchange's coupled outputs (computed above)
 * and compares them to the previous exchange's coupled outputs (from history).
 */
function calculateVelocity(
  currentCoupledRegister: RegisterDistribution,
  currentCoupledMovement: MovementIndicators,
  currentSymbolicActivation: number,
  previousVectors: TherapeuticStateVector[]
): TherapeuticStateVector['velocity'] {
  if (previousVectors.length === 0) {
    return {
      registerShiftRate: 0,
      deepeningAcceleration: 0,
      resistanceTrajectory: 0,
      symbolicActivationRate: 0
    };
  }

  const prev = previousVectors[previousVectors.length - 1];

  // Register shift rate: how different is current coupled distribution from previous coupled?
  const registerDelta =
    Math.abs(currentCoupledRegister.Real - prev.coupled.registerDistribution.Real)
    + Math.abs(currentCoupledRegister.Imaginary - prev.coupled.registerDistribution.Imaginary)
    + Math.abs(currentCoupledRegister.Symbolic - prev.coupled.registerDistribution.Symbolic);
  const registerShiftRate = Math.min(1, registerDelta / 2);

  // Deepening acceleration: coupled deepening vs previous coupled deepening
  const deepeningDelta = currentCoupledMovement.deepening - prev.coupled.movementIndicators.deepening;
  const deepeningAcceleration = Math.max(-1, Math.min(1, deepeningDelta * 5));

  // Resistance trajectory: coupled resistance vs previous coupled resistance
  const resistanceDelta = currentCoupledMovement.resistance - prev.coupled.movementIndicators.resistance;
  const resistanceTrajectory = Math.max(-1, Math.min(1, resistanceDelta * 5));

  // Symbolic activation rate: current vs previous coupled symbolic activation
  const symbolicDelta = currentSymbolicActivation - prev.coupled.symbolicActivation;
  const symbolicActivationRate = Math.max(-1, Math.min(1, symbolicDelta * 5));

  return {
    registerShiftRate,
    deepeningAcceleration,
    resistanceTrajectory,
    symbolicActivationRate
  };
}

// ============================================================
// STATE VECTOR HISTORY MANAGEMENT
// ============================================================

export function createStateVectorHistory(maxHistory: number = 10): StateVectorHistory {
  return { vectors: [], maxHistory };
}

export function pushStateVector(
  history: StateVectorHistory,
  vector: TherapeuticStateVector
): void {
  history.vectors.push(vector);
  if (history.vectors.length > history.maxHistory) {
    history.vectors.shift();
  }
}

/**
 * Get inter-session field summary for cross-session continuity.
 * Call at session end to create a summary that persists in DB.
 *
 * NOTE: If you stringify this for DB storage, Date fields in individual
 * vectors will become ISO strings. The summary itself uses only primitives.
 */
export function getFieldSummary(history: StateVectorHistory): {
  averageMomentum: number;
  registerTrend: { Real: number; Imaginary: number; Symbolic: number };
  peakSymbolicActivation: number;
  cssProgressionDirection: 'advancing' | 'stable' | 'retreating';
  dominantVelocityPattern: string;
} {
  if (history.vectors.length === 0) {
    return {
      averageMomentum: 0,
      registerTrend: { Real: 0, Imaginary: 0, Symbolic: 0 },
      peakSymbolicActivation: 0,
      cssProgressionDirection: 'stable',
      dominantVelocityPattern: 'insufficient data'
    };
  }

  const vectors = history.vectors;

  const averageMomentum = vectors.reduce((sum, v) => sum + v.coupled.therapeuticMomentum, 0) / vectors.length;

  const midpoint = Math.floor(vectors.length / 2);
  const firstHalf = vectors.slice(0, midpoint);
  const secondHalf = vectors.slice(midpoint);

  const avgHalf = (arr: TherapeuticStateVector[], key: keyof RegisterDistribution) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v.coupled.registerDistribution[key], 0) / arr.length : 0.33;

  const registerTrend = {
    Real: avgHalf(secondHalf, 'Real') - avgHalf(firstHalf, 'Real'),
    Imaginary: avgHalf(secondHalf, 'Imaginary') - avgHalf(firstHalf, 'Imaginary'),
    Symbolic: avgHalf(secondHalf, 'Symbolic') - avgHalf(firstHalf, 'Symbolic')
  };

  const peakSymbolicActivation = Math.max(...vectors.map(v => v.coupled.symbolicActivation));

  const cssOrder: Record<string, number> = {
    'pointed_origin': 0, 'focus_bind': 1, 'suspension': 2,
    'gesture_toward': 3, 'completion': 4, 'terminal': 5
  };
  const firstCSS = cssOrder[vectors[0].coupled.cssStage] ?? 0;
  const lastCSS = cssOrder[vectors[vectors.length - 1].coupled.cssStage] ?? 0;
  const cssProgressionDirection = lastCSS > firstCSS ? 'advancing' :
    lastCSS < firstCSS ? 'retreating' : 'stable';

  const avgDeepAccel = vectors.reduce((s, v) => s + v.velocity.deepeningAcceleration, 0) / vectors.length;
  const avgResTrajectory = vectors.reduce((s, v) => s + v.velocity.resistanceTrajectory, 0) / vectors.length;
  let dominantVelocityPattern = 'steady';
  if (avgDeepAccel > 0.2) dominantVelocityPattern = 'accelerating deepening';
  else if (avgResTrajectory > 0.2) dominantVelocityPattern = 'rising resistance';
  else if (avgDeepAccel < -0.2) dominantVelocityPattern = 'decelerating';
  else if (avgResTrajectory < -0.2) dominantVelocityPattern = 'resistance dissolving';

  return {
    averageMomentum,
    registerTrend,
    peakSymbolicActivation,
    cssProgressionDirection,
    dominantVelocityPattern
  };
}
