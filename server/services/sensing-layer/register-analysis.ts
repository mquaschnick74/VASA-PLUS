// server/services/sensing-layer/register-analysis.ts
// Register Analysis module for the Sensing Layer
// Analyzes whether user is in Real, Imaginary, or Symbolic register

import {
  TurnInput,
  UserTherapeuticProfile,
  RegisterAnalysisResult,
  Register,
  RegisterDistribution,
  RegisterMovement,
  RegisterIndicators,
  RegisterHistoryEntry
} from './types';
import { getSessionState } from './session-state';

/**
 * Real Register Markers
 * Body-based, sensation-focused, present-moment experience
 */
const REAL_MARKERS = {
  bodyWords: [
    'body', 'chest', 'stomach', 'gut', 'throat', 'shoulders', 'back', 'neck',
    'hands', 'heart', 'breath', 'breathing', 'muscles', 'tension', 'jaw',
    'belly', 'head', 'legs', 'arms', 'skin', 'face'
  ],
  sensationWords: [
    'tight', 'tightness', 'heavy', 'heaviness', 'light', 'lightness', 'warm',
    'cold', 'hot', 'tingling', 'numb', 'pressure', 'ache', 'pain', 'pounding',
    'racing', 'churning', 'knot', 'constricted', 'open', 'closed', 'flowing',
    'stuck', 'frozen', 'shaking', 'trembling', 'hollow', 'empty', 'full',
    'expanding', 'contracting', 'sinking', 'floating', 'grounded', 'dizzy'
  ],
  presentMomentPhrases: [
    'right now', 'in this moment', 'i notice', 'i feel', 'as i sit here',
    "i'm aware", 'i can sense', 'something in my'
  ],
  physiologicalPhrases: [
    "i don't know why", "i can't explain", 'it just', 'my body',
    'physical', 'sensation', 'felt sense'
  ]
};

/**
 * Imaginary Register Markers
 * Story-telling, what-if scenarios, identity statements, elaboration
 */
const IMAGINARY_MARKERS = {
  storyTellingPhrases: [
    'and then', 'so i said', 'he said', 'she said', 'they said', 'and i was like',
    'it was like', 'the thing is', 'basically', 'so basically', 'you know how',
    'let me tell you', 'so what happened was', 'long story short'
  ],
  whatIfPhrases: [
    'what if', 'imagine if', 'what would happen if', 'if only', 'maybe if',
    'could have', 'should have', 'would have', 'might have', 'if i had'
  ],
  identityStatements: [
    "i'm the kind of person", "i'm just someone who", "that's just who i am",
    "i've always been", "i'm not the type", "people like me", "i'm just",
    "i'm too", "i'm not", "that's not me", "that's so me"
  ],
  elaborationMarkers: [
    'anyway', 'so anyway', 'the point is', 'going back to', 'as i was saying',
    'let me explain', 'here\'s the thing', 'actually', 'well actually',
    'you see', 'i mean', 'you know what i mean'
  ],
  externalFocus: [
    'they always', 'he always', 'she always', 'people always', 'everyone',
    'nobody', 'the world', 'society', 'they think', 'everyone thinks'
  ]
};

/**
 * Symbolic Register Markers
 * Pattern recognition, contradiction awareness, abstraction
 */
const SYMBOLIC_MARKERS = {
  patternRecognition: [
    'i always', 'i never', 'every time', 'the same thing', 'pattern',
    'cycle', 'again and again', 'i keep', 'it keeps happening', 'recurring',
    'this always happens', 'i do this every time', 'history repeating'
  ],
  contradictionAwareness: [
    'part of me', 'on one hand', 'on the other hand', 'both', 'and also',
    'but at the same time', 'conflicted', 'torn', 'ambivalent', 'mixed',
    'simultaneously', 'paradox', 'contradiction', 'it\'s complicated'
  ],
  abstractionPhrases: [
    'in general', 'overall', 'fundamentally', 'essentially', 'at the core',
    'underlying', 'deep down', 'represents', 'symbolizes', 'means that',
    'what this shows', 'what this tells me'
  ],
  intellectualization: [
    'i think that', 'logically', 'rationally', 'objectively', 'theoretically',
    'intellectually', 'from a psychological perspective', 'if you analyze',
    'in retrospect', 'upon reflection', 'analyzing', 'understanding'
  ],
  metaCognition: [
    'i realize', 'i notice that i', 'i see myself', 'watching myself',
    'aware that i', 'conscious that', 'it occurs to me', 'i can see now',
    'looking at myself', 'stepping back'
  ]
};

/**
 * Analyze the register of a user utterance
 */
export async function analyzeRegister(
  input: TurnInput,
  profile: UserTherapeuticProfile
): Promise<RegisterAnalysisResult> {
  console.log(`📊 [Register Analysis] Processing utterance for user: ${input.userId}`);

  const utteranceLower = input.utterance.toLowerCase();

  // 1. Detect indicators for each register
  const indicators = detectRegisterIndicators(utteranceLower);

  // 2. Calculate distribution for current utterance
  const currentDistribution = calculateDistribution(indicators);

  // 3. Determine current register
  const currentRegister = determineRegister(currentDistribution);

  // 4. Calculate session-level dominance from history
  const sessionDominance = calculateSessionDominance(input, profile.registerHistory, currentRegister);

  // 5. Calculate stuckness and fluidity
  const sessionAccumulator = getSessionState(input.callId);
  const inSessionReadings = sessionAccumulator?.registerReadings ?? [];

  const { stucknessScore, fluidityScore } = calculateFluidityMetrics(
    input,
    profile.registerHistory,
    currentRegister,
    inSessionReadings
  );

  // 6. Determine register movement
  const registerMovement = determineMovement(input, profile.registerHistory, currentRegister);

  console.log(`📊 [Register Analysis] Current: ${currentRegister}, Stuckness: ${stucknessScore.toFixed(2)}, Movement: ${registerMovement}`);

  return {
    currentRegister,
    sessionDominance,
    registerDistribution: currentDistribution,
    stucknessScore,
    fluidityScore,
    registerMovement,
    indicators
  };
}

/**
 * Detect indicators for each register in the utterance
 */
function detectRegisterIndicators(utterance: string): RegisterIndicators {
  const realIndicators: string[] = [];
  const imaginaryIndicators: string[] = [];
  const symbolicIndicators: string[] = [];

  // Check Real markers
  for (const word of REAL_MARKERS.bodyWords) {
    if (utterance.includes(word)) realIndicators.push(`body:${word}`);
  }
  for (const word of REAL_MARKERS.sensationWords) {
    if (utterance.includes(word)) realIndicators.push(`sensation:${word}`);
  }
  for (const phrase of REAL_MARKERS.presentMomentPhrases) {
    if (utterance.includes(phrase)) realIndicators.push(`present:${phrase}`);
  }
  for (const phrase of REAL_MARKERS.physiologicalPhrases) {
    if (utterance.includes(phrase)) realIndicators.push(`physio:${phrase}`);
  }

  // Check Imaginary markers
  for (const phrase of IMAGINARY_MARKERS.storyTellingPhrases) {
    if (utterance.includes(phrase)) imaginaryIndicators.push(`story:${phrase}`);
  }
  for (const phrase of IMAGINARY_MARKERS.whatIfPhrases) {
    if (utterance.includes(phrase)) imaginaryIndicators.push(`whatif:${phrase}`);
  }
  for (const phrase of IMAGINARY_MARKERS.identityStatements) {
    if (utterance.includes(phrase)) imaginaryIndicators.push(`identity:${phrase}`);
  }
  for (const marker of IMAGINARY_MARKERS.elaborationMarkers) {
    if (utterance.includes(marker)) imaginaryIndicators.push(`elaboration:${marker}`);
  }
  for (const phrase of IMAGINARY_MARKERS.externalFocus) {
    if (utterance.includes(phrase)) imaginaryIndicators.push(`external:${phrase}`);
  }

  // Check Symbolic markers
  for (const phrase of SYMBOLIC_MARKERS.patternRecognition) {
    if (utterance.includes(phrase)) symbolicIndicators.push(`pattern:${phrase}`);
  }
  for (const phrase of SYMBOLIC_MARKERS.contradictionAwareness) {
    if (utterance.includes(phrase)) symbolicIndicators.push(`contradiction:${phrase}`);
  }
  for (const phrase of SYMBOLIC_MARKERS.abstractionPhrases) {
    if (utterance.includes(phrase)) symbolicIndicators.push(`abstraction:${phrase}`);
  }
  for (const phrase of SYMBOLIC_MARKERS.intellectualization) {
    if (utterance.includes(phrase)) symbolicIndicators.push(`intellectual:${phrase}`);
  }
  for (const phrase of SYMBOLIC_MARKERS.metaCognition) {
    if (utterance.includes(phrase)) symbolicIndicators.push(`meta:${phrase}`);
  }

  return { realIndicators, imaginaryIndicators, symbolicIndicators };
}

/**
 * Calculate register distribution based on indicators
 */
function calculateDistribution(indicators: RegisterIndicators): RegisterDistribution {
  const realCount = indicators.realIndicators.length;
  const imaginaryCount = indicators.imaginaryIndicators.length;
  const symbolicCount = indicators.symbolicIndicators.length;
  const total = realCount + imaginaryCount + symbolicCount;

  if (total === 0) {
    // Default to slight imaginary bias when no markers found (neutral speech)
    return { Real: 0.25, Imaginary: 0.5, Symbolic: 0.25 };
  }

  // Weight different indicator types
  const realScore = realCount * 1.0;  // Body/sensation heavily weighted
  const imaginaryScore = imaginaryCount * 0.8;  // Stories slightly less weighted
  const symbolicScore = symbolicCount * 1.2;  // Pattern recognition highly weighted

  const totalWeighted = realScore + imaginaryScore + symbolicScore;

  return {
    Real: realScore / totalWeighted,
    Imaginary: imaginaryScore / totalWeighted,
    Symbolic: symbolicScore / totalWeighted
  };
}

/**
 * Determine the dominant register from distribution
 */
function determineRegister(distribution: RegisterDistribution): Register {
  const { Real, Imaginary, Symbolic } = distribution;

  // Check for clear dominance (>50%)
  if (Real > 0.5) return 'Real';
  if (Imaginary > 0.5) return 'Imaginary';
  if (Symbolic > 0.5) return 'Symbolic';

  // Check for relative dominance
  if (Real >= Imaginary && Real >= Symbolic) return 'Real';
  if (Imaginary >= Real && Imaginary >= Symbolic) return 'Imaginary';
  return 'Symbolic';
}

/**
 * Calculate session-level register dominance
 */
function calculateSessionDominance(
  input: TurnInput,
  registerHistory: RegisterHistoryEntry[],
  currentRegister: Register
): Register {
  // Get history for this session
  const sessionHistory = registerHistory.filter(
    entry => entry.sessionId === input.sessionId
  );

  if (sessionHistory.length === 0) {
    return currentRegister;
  }

  // Count register occurrences
  const counts: Record<Register, number> = { Real: 0, Imaginary: 0, Symbolic: 0 };

  for (const entry of sessionHistory) {
    counts[entry.dominantRegister]++;
  }

  // Add current
  counts[currentRegister]++;

  // Find most common
  if (counts.Real >= counts.Imaginary && counts.Real >= counts.Symbolic) return 'Real';
  if (counts.Imaginary >= counts.Real && counts.Imaginary >= counts.Symbolic) return 'Imaginary';
  return 'Symbolic';
}

/**
 * Calculate stuckness and fluidity metrics
 */
function calculateFluidityMetrics(
  input: TurnInput,
  registerHistory: RegisterHistoryEntry[],
  currentRegister: Register,
  inSessionReadings: Array<{ exchange: number; register: Register; timestamp: Date }> = []
): { stucknessScore: number; fluidityScore: number } {
  // Primary: use in-session readings if sufficient
  if (inSessionReadings.length >= 2) {
    const readings = [...inSessionReadings, {
      exchange: input.exchangeCount,
      register: currentRegister,
      timestamp: new Date()
    }];

    let transitions = 0;
    let consecutiveSame = 0;
    let maxConsecutive = 0;
    let prevRegister = readings[0].register;

    for (let i = 1; i < readings.length; i++) {
      if (readings[i].register !== prevRegister) {
        transitions++;
        consecutiveSame = 0;
      } else {
        consecutiveSame++;
        maxConsecutive = Math.max(maxConsecutive, consecutiveSame);
      }
      prevRegister = readings[i].register;
    }

    const stucknessScore = Math.min(1, maxConsecutive / 4);
    const transitionRate = transitions / (readings.length - 1);
    let fluidityScore: number;
    if (transitionRate < 0.2) fluidityScore = transitionRate * 2.5;
    else if (transitionRate > 0.6) fluidityScore = 1 - (transitionRate - 0.6);
    else fluidityScore = 0.5 + (transitionRate - 0.2) * 1.25;

    return { stucknessScore, fluidityScore };
  }

  // Fallback: use cross-session database history
  const sessionHistory = registerHistory
    .filter(entry => entry.sessionId === input.sessionId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  if (sessionHistory.length < 3) {
    return { stucknessScore: 0.3, fluidityScore: 0.5 };
  }

  let transitions = 0;
  let consecutiveSame = 0;
  let maxConsecutive = 0;
  let prevRegister = currentRegister;

  for (const entry of sessionHistory) {
    if (entry.dominantRegister === prevRegister) {
      consecutiveSame++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveSame);
    } else {
      consecutiveSame = 0;
    }
    prevRegister = entry.dominantRegister;
  }

  const stucknessScore = Math.min(1, maxConsecutive / 6);

  let transitionsDb = 0;
  let lastRegister = currentRegister;
  for (const entry of sessionHistory) {
    if (entry.dominantRegister !== lastRegister) transitionsDb++;
    lastRegister = entry.dominantRegister;
  }

  const transitionRate = transitionsDb / (sessionHistory.length - 1);
  let fluidityScore: number;
  if (transitionRate < 0.2) fluidityScore = transitionRate * 2.5;
  else if (transitionRate > 0.6) fluidityScore = 1 - (transitionRate - 0.6);
  else fluidityScore = 0.5 + (transitionRate - 0.2) * 1.25;

  return { stucknessScore, fluidityScore };
}

/**
 * Determine register movement direction
 */
function determineMovement(
  input: TurnInput,
  registerHistory: RegisterHistoryEntry[],
  currentRegister: Register
): RegisterMovement {
  // Get last few entries for this session
  const recentHistory = registerHistory
    .filter(entry => entry.sessionId === input.sessionId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  if (recentHistory.length < 2) {
    return 'static';
  }

  // Analyze recent register sequence
  const registers = [currentRegister, ...recentHistory.map(e => e.dominantRegister)];
  const uniqueRegisters = new Set(registers.slice(0, 5));

  // Check for fluidity (all 3 registers present)
  if (uniqueRegisters.size === 3) {
    return 'fluid';
  }

  // Check for movement toward a specific register
  const lastRegister = recentHistory[0]?.dominantRegister;

  if (lastRegister === currentRegister) {
    return 'static';
  }

  // Determine movement direction
  if (currentRegister === 'Real') return 'toward_real';
  if (currentRegister === 'Imaginary') return 'toward_imaginary';
  if (currentRegister === 'Symbolic') return 'toward_symbolic';

  return 'static';
}

/**
 * Assess register quality for therapeutic guidance
 */
export function assessRegisterQuality(result: RegisterAnalysisResult): {
  quality: 'healthy' | 'concerning' | 'stuck';
  guidance: string;
} {
  const { stucknessScore, currentRegister, registerMovement } = result;

  // Check for healthy fluidity
  if (registerMovement === 'fluid' && stucknessScore < 0.3) {
    return {
      quality: 'healthy',
      guidance: 'User showing healthy register fluidity. Support continued exploration.'
    };
  }

  // Check for stuck in Imaginary (common issue)
  if (currentRegister === 'Imaginary' && stucknessScore > 0.6) {
    return {
      quality: 'stuck',
      guidance: 'User appears stuck in Imaginary register (storytelling/elaboration). Consider grounding techniques to move toward Real.'
    };
  }

  // Check for excessive intellectualization in Symbolic
  if (currentRegister === 'Symbolic' && stucknessScore > 0.5) {
    const hasIntellectualization = result.indicators.symbolicIndicators
      .some(i => i.startsWith('intellectual:'));

    if (hasIntellectualization) {
      return {
        quality: 'concerning',
        guidance: 'User may be intellectualizing. Consider inviting body awareness to ground insight.'
      };
    }
  }

  // Check for avoidance of Real register
  if (result.registerDistribution.Real < 0.1 && stucknessScore > 0.4) {
    return {
      quality: 'concerning',
      guidance: 'User avoiding body/somatic experience. Gentle invitation to notice bodily sensations may be therapeutic.'
    };
  }

  return {
    quality: 'healthy',
    guidance: 'Register presentation within normal therapeutic range.'
  };
}
