// server/services/sensing-layer/guidance-generator.ts
// Therapeutic Guidance Generator for the Sensing Layer
// Uses Claude to generate context-aware therapeutic guidance
// Enhanced with RAG (Retrieval-Augmented Generation) for PCA/PCP methodology

import Anthropic from '@anthropic-ai/sdk';
import {
  TurnInput,
  OrientationStateRegister,
  TherapeuticGuidance,
  TherapeuticPosture,
  RegisterDirection,
  GuidanceUrgency,
  Register,
  EnhancedTherapeuticGuidance,
  GenerativeSymbolicInsight,
  AnticipationState
} from './types';
import {
  getRelevantGuidance,
  KnowledgeChunk
} from './knowledge-base';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Generate therapeutic guidance based on the Orientation State Register
 * Now returns EnhancedTherapeuticGuidance with anticipation support
 */
export async function generateGuidance(
  osr: OrientationStateRegister,
  input: TurnInput
): Promise<EnhancedTherapeuticGuidance> {
  console.log(`🎯 [Guidance Generator] Generating guidance for user: ${input.userId}`);

  const startTime = Date.now();

  // Extract anticipation and generative insight for enhanced guidance
  const anticipation = osr.movement.anticipation;
  const generativeInsight = osr.symbolic.generativeInsight;

  // 1. First, try rule-based guidance for speed
  const ruleBasedGuidance = generateRuleBasedGuidance(osr, input);

  // 2. Enhance with anticipation guidance
  const anticipationGuidance = generateAnticipationGuidance(anticipation, generativeInsight);

  // Combine rule-based with anticipation guidance
  const enhancedGuidance: EnhancedTherapeuticGuidance = {
    ...ruleBasedGuidance,
    anticipationGuidance,
    symbolicContext: generateSymbolicContext(osr),
    enhancedPosture: {
      mode: anticipation.patience.shouldWait ? 'wait_and_track' : ruleBasedGuidance.posture,
      intensity: 'gentle',
      description: anticipation.patience.shouldWait
        ? `Let user continue building. ${anticipation.patience.waitingFor}`
        : POSTURE_DESCRIPTIONS[ruleBasedGuidance.posture]
    },
    enhancedStrategicDirection: {
      moveToward: ruleBasedGuidance.strategicDirection,
      currentGoal: anticipation.patience.shouldWait
        ? 'Create space for elaboration'
        : 'Engage with emerging material',
      longerArc: anticipation.trajectory.buildingToward
    }
  };

  console.log(`🎯 [Guidance Generator] Enhanced rule-based guidance generated (${Date.now() - startTime}ms)`);
  return enhancedGuidance;
}

/**
 * Posture descriptions
 */
const POSTURE_DESCRIPTIONS: Record<TherapeuticPosture, string> = {
  probe: 'Ask deepening questions to explore further',
  hold: 'Stay with what\'s present. Allow space.',
  challenge: 'Gently name the contradiction',
  support: 'Validate and provide scaffolding',
  reflect: 'Mirror back what you\'re hearing',
  silent: 'Allow extended silence',
  wait_and_track: 'Strategic patience - let user build material'
};

/**
 * Generate anticipation-specific guidance
 */
function generateAnticipationGuidance(
  anticipation: AnticipationState,
  generativeInsight: GenerativeSymbolicInsight
): EnhancedTherapeuticGuidance['anticipationGuidance'] {
  return {
    userBuildingToward: anticipation.trajectory.buildingToward,
    currentPhase: anticipation.timing.phase,
    shouldWait: anticipation.patience.shouldWait,
    waitingFor: anticipation.patience.shouldWait ? anticipation.patience.waitingFor : undefined,
    potentialIntervention: generativeInsight.potentialConnection?.suggestedIntervention,
    interventionTiming: generativeInsight.potentialConnection?.interventionTiming || anticipation.timing.phase,
    riskIfPremature: anticipation.patience.shouldWait
      ? anticipation.patience.riskOfPrematureIntervention
      : undefined
  };
}

/**
 * Generate symbolic context for therapist awareness
 */
function generateSymbolicContext(osr: OrientationStateRegister): EnhancedTherapeuticGuidance['symbolicContext'] | undefined {
  const generativeInsight = osr.symbolic.generativeInsight;

  if (generativeInsight.potentialConnection) {
    return {
      activeConnection: generativeInsight.potentialConnection.connectionInsight,
      userAwareness: generativeInsight.potentialConnection.interventionTiming,
      guidanceNote: generativeInsight.potentialConnection.suggestedIntervention || 'Guide toward discovery without naming'
    };
  }

  if (osr.symbolic.activeMappings.length > 0) {
    const mapping = osr.symbolic.activeMappings[0];
    return {
      activeConnection: mapping.presentPattern,
      userAwareness: mapping.userAwareness,
      guidanceNote: `Connection to: ${mapping.historicalMaterial}`
    };
  }

  return undefined;
}

/**
 * Check if the situation requires Claude for nuanced guidance.
 * Tightened to only trigger for genuinely pivotal moments (~15-25% of turns).
 * Rule-based guidance handles routine turns well.
 */
function isComplexSituation(osr: OrientationStateRegister): boolean {
  // ALWAYS TRIGGER: Safety-critical — user is overwhelmed
  if (osr.movement.indicators.flooding > 0.5) return true;

  // ALWAYS TRIGGER: Active awareness shift — real-time breakthrough
  if (osr.symbolic.awarenessShift) return true;

  // High symbolic activation — a known mapping is strongly resonating
  if (osr.symbolic.activeMappings.some(m => m.currentActivation > 0.8)) return true;

  // Pivotal CSS stages with reasonable confidence
  const pivotalStages = ['gesture_toward', 'completion', 'terminal'];
  if (pivotalStages.includes(osr.movement.cssStage)) {
    if ((osr.movement.cssStageConfidence ?? 0) > 0.5) return true;
  }

  // Strong resistance combined with high stuckness
  if (osr.movement.indicators.resistance > 0.5 && osr.register.stucknessScore > 0.7) return true;

  // Rich convergence: strong symbolic connection AND multiple patterns
  const hasStrongSymbolicConnection =
    osr.symbolic.generativeInsight?.potentialConnection?.confidence &&
    osr.symbolic.generativeInsight.potentialConnection.confidence > 0.7;
  const hasMultiplePatterns = osr.patterns.activePatterns.length >= 3;
  if (hasStrongSymbolicConnection && hasMultiplePatterns) return true;

  // Phase transition imminent
  const phaseProximity = osr.meta?.stateVector?.coupled?.phaseTransitionProximity ?? 0;
  if (phaseProximity > 0.7) return true;

  // DEFAULT: Use fast rule-based guidance
  return false;
}

/**
 * Generate rule-based therapeutic guidance (fast)
 */
function generateRuleBasedGuidance(
  osr: OrientationStateRegister,
  input: TurnInput
): TherapeuticGuidance {
  // Determine posture based on movement and register
  const posture = determinePosture(osr);

  // Determine register direction if needed
  const registerDirection = determineRegisterDirection(osr);

  // Generate strategic direction
  const strategicDirection = generateStrategicDirection(osr);

  // Determine avoidances
  const avoidances = determineAvoidances(osr);

  // Determine urgency
  const urgency = determineUrgency(osr);

  // Calculate confidence (lower for rule-based)
  const confidence = calculateRuleBasedConfidence(osr);

  return {
    posture,
    registerDirection,
    strategicDirection,
    avoidances,
    framing: null,
    urgency,
    confidence
  };
}

/**
 * Determine therapeutic posture based on OSR
 */
function determinePosture(osr: OrientationStateRegister): TherapeuticPosture {
  const { movement, register, patterns } = osr;

  // If flooding, support first
  if (movement.indicators.flooding > 0.4) {
    return 'support';
  }

  // If strong resistance, hold/reflect
  if (movement.indicators.resistance > 0.4) {
    return 'hold';
  }

  // If looping, consider challenge
  if (movement.indicators.looping > 0.4 && movement.sessionPosition === 'working') {
    return 'challenge';
  }

  // If user identified a pattern, reflect it back
  if (patterns.userExplicitIdentification) {
    return 'reflect';
  }

  // If deepening, probe further
  if (movement.indicators.deepening > 0.3) {
    return 'probe';
  }

  // If integration happening, hold space
  if (movement.indicators.integration > 0.3) {
    return 'hold';
  }

  // If stuck in Imaginary, probe toward Real
  if (register.currentRegister === 'Imaginary' && register.stucknessScore > 0.4) {
    return 'probe';
  }

  // Phase transition approaching — hold space, don't disrupt
  const proximity = osr.meta?.stateVector?.coupled.phaseTransitionProximity;
  if (proximity !== undefined && proximity > 0.6 &&
      ['suspension', 'gesture_toward'].includes(osr.movement.cssStage)) {
    return 'hold';
  }

  // Rapid deepening acceleration — follow, don't lead
  const deepAccel = osr.meta?.stateVector?.velocity.deepeningAcceleration;
  if (deepAccel !== undefined && deepAccel > 0.4) {
    return 'hold';
  }

  // Resistance dissolving — probe gently to support momentum
  const resistTrajectory = osr.meta?.stateVector?.velocity.resistanceTrajectory;
  if (resistTrajectory !== undefined && resistTrajectory < -0.3 &&
      osr.movement.indicators.resistance < 0.3) {
    return 'probe';
  }

  // Default to probe in early session, hold later
  if (osr.movement.sessionPosition === 'opening' || osr.movement.sessionPosition === 'developing') {
    return 'probe';
  }

  return 'hold';
}

/**
 * Determine if register direction guidance is needed
 */
function determineRegisterDirection(osr: OrientationStateRegister): RegisterDirection | null {
  const { register } = osr;

  // Only suggest direction if stuck
  if (register.stucknessScore < 0.4) {
    return null;
  }

  // Stuck in Imaginary → guide toward Symbolic (meaning/pattern)
  if (register.currentRegister === 'Imaginary') {
    return {
      from: 'Imaginary',
      toward: 'Symbolic',
      technique: 'Invite pattern recognition: "What does this remind you of?" or "What story is your mind telling you about this?"'
    };
  }

  // Stuck in Symbolic (intellectualizing) → guide toward Imaginary (story/feeling)
  if (register.currentRegister === 'Symbolic' &&
      register.indicators.symbolicIndicators.some(i => i.startsWith('intellectual:'))) {
    return {
      from: 'Symbolic',
      toward: 'Imaginary',
      technique: 'Move from concept to experience: "What does that actually feel like for you?" or "When did you first notice this pattern?"'
    };
  }

  // Stuck in Real (can\'t make meaning) → guide toward Symbolic
  if (register.currentRegister === 'Real' && register.stucknessScore > 0.5) {
    return {
      from: 'Real',
      toward: 'Symbolic',
      technique: 'Invite meaning-making: "What might this sensation be trying to tell you?"'
    };
  }

  return null;
}

/**
 * Generate strategic therapeutic direction
 */
function generateStrategicDirection(osr: OrientationStateRegister): string {
  const { movement, patterns, symbolic } = osr;

  // High therapeutic momentum — acknowledge and support the direction
  const momentum = osr.meta?.stateVector?.coupled.therapeuticMomentum;
  if (momentum !== undefined && momentum > 0.5) {
    return 'User is making significant progress. Follow their lead and deepen what they are already exploring.';
  }
  if (momentum !== undefined && momentum < -0.5) {
    return 'User may be retreating. Slow the pace. Prioritize safety and alliance over depth.';
  }

  // If awareness shift happening, support integration
  if (symbolic.awarenessShift) {
    return 'Support emerging awareness. User is making connections between past and present.';
  }

  // If active symbolic mapping, explore it
  if (symbolic.activeMappings.length > 0) {
    const mapping = symbolic.activeMappings[0];
    return `Explore ${mapping.connectionType.replace('_', ' ')}: User may be connecting present to "${mapping.presentPattern}"`;
  }

  // If user explicitly identified pattern
  if (patterns.userExplicitIdentification) {
    return 'User has identified a pattern. Explore its origins and function.';
  }

  // CSS stage based direction
  switch (movement.cssStage) {
    case 'pointed_origin':
      return 'Focus on building alliance and understanding presenting concerns.';
    case 'focus_bind':
      return 'Help user articulate and hold the contradiction without resolving prematurely.';
    case 'suspension':
      return 'Support capacity to tolerate ambiguity. Validate the difficulty of holding multiple truths.';
    case 'gesture_toward':
      return 'Support emerging movement without pushing. User is beginning to see new possibilities.';
    case 'completion':
      return 'Support integration of new understanding into action and identity.';
    case 'terminal':
      return 'Celebrate growth while acknowledging ongoing journey.';
  }

  // Session position based direction
  switch (movement.sessionPosition) {
    case 'opening':
      return 'Establish safety and explore what\'s present for user today.';
    case 'developing':
      return 'Deepen exploration of emerging themes.';
    case 'working':
      return 'Engage therapeutically with core material.';
    case 'integrating':
      return 'Begin synthesizing session insights.';
    case 'closing':
      return 'Support landing and transition out of session.';
  }

  return 'Stay present and follow the user\'s lead.';
}

/**
 * Determine what to avoid in therapeutic response
 */
function determineAvoidances(osr: OrientationStateRegister): string[] {
  const avoidances: string[] = [];
  const { movement, register, symbolic } = osr;

  // If flooding, avoid deepening
  if (movement.indicators.flooding > 0.3) {
    avoidances.push('Avoid deepening questions - user may be overwhelmed');
    avoidances.push('Do not probe for more emotional content right now');
  }

  // If high resistance, avoid challenge
  if (movement.indicators.resistance > 0.4) {
    avoidances.push('Avoid direct challenge to defenses');
    avoidances.push('Do not push past stated boundaries');
  }

  // If intellectualizing, don\'t reinforce with cognitive talk
  if (movement.indicators.intellectualizing > 0.3) {
    avoidances.push('Avoid purely cognitive/analytical responses');
    avoidances.push('Do not match intellectualization with interpretation');
  }

  // If unconscious symbolic mapping, don\'t interpret prematurely
  if (symbolic.activeMappings.some(m => m.userAwareness === 'unconscious')) {
    avoidances.push('Avoid explicit interpretation of unconscious material');
    avoidances.push('Do not connect past to present before user is ready');
  }

  // If in Imaginary and looping
  if (register.currentRegister === 'Imaginary' && movement.indicators.looping > 0.3) {
    avoidances.push('Avoid asking for more story details');
    avoidances.push('Do not encourage further elaboration of narrative');
  }

  // If early session
  if (movement.sessionPosition === 'opening') {
    avoidances.push('Avoid deep interpretive work before alliance established');
  }

  // If closing
  if (movement.sessionPosition === 'closing') {
    avoidances.push('Avoid opening new material');
    avoidances.push('Do not introduce new therapeutic challenges');
  }

  return avoidances.slice(0, 4); // Limit to 4 avoidances
}

/**
 * Determine urgency level
 */
function determineUrgency(osr: OrientationStateRegister): GuidanceUrgency {
  const { movement, symbolic } = osr;

  // Immediate if flooding
  if (movement.indicators.flooding > 0.5) {
    return 'immediate';
  }

  // High if awareness shift happening (therapeutic moment)
  if (symbolic.awarenessShift) {
    return 'high';
  }

  // High if strong symbolic activation
  if (symbolic.activeMappings.some(m => m.currentActivation > 0.7)) {
    return 'high';
  }

  // Moderate if resistance or looping
  if (movement.indicators.resistance > 0.3 || movement.indicators.looping > 0.3) {
    return 'moderate';
  }

  return 'low';
}

/**
 * Calculate confidence for rule-based guidance
 */
function calculateRuleBasedConfidence(osr: OrientationStateRegister): number {
  let confidence = 0.6; // Base confidence

  // Increase if clear patterns
  if (osr.patterns.activePatterns.length > 0) confidence += 0.1;

  // Increase if clear movement direction
  if (osr.movement.trajectory === 'toward_mastery' || osr.movement.trajectory === 'away_from_mastery') {
    confidence += 0.1;
  }

  // Decrease if complex situation
  if (osr.symbolic.activeMappings.length > 1) confidence -= 0.1;
  if (osr.register.stucknessScore > 0.5) confidence -= 0.05;

  return Math.min(0.85, Math.max(0.4, confidence));
}

/**
 * Generate enhanced guidance using Claude with anticipation, generative insight, and RAG
 */
async function generateEnhancedClaudeGuidance(
  osr: OrientationStateRegister,
  input: TurnInput
): Promise<EnhancedTherapeuticGuidance> {
  // Extract anticipation and generative insight
  const anticipation = osr.movement.anticipation;
  const generativeInsight = osr.symbolic.generativeInsight;

  // Fire RAG as a non-blocking promise immediately
  const ragPromise = (async (): Promise<string> => {
    const ragStart = Date.now();
    try {
      const ragResult = await getRelevantGuidance(osr);
      const ragTime = Date.now() - ragStart;
      if (ragResult.chunks.length > 0) {
        console.log(`🧠 [RAG] Retrieved ${ragResult.chunks.length} chunks in ${ragTime}ms`);
        return ragResult.context;
      }
      console.log(`🧠 [RAG] No chunks retrieved (${ragTime}ms)`);
      return '';
    } catch (error) {
      console.warn(`🧠 [RAG] Failed after ${Date.now() - ragStart}ms:`, error);
      return '';
    }
  })();

  // While RAG runs, prepare OSR summary (instant)
  const osrSummary = prepareEnhancedOSRSummary(osr);

  // Await RAG result — if it finished during prep, zero wait
  const retrievedContext = await ragPromise;

  const prompt = `You are a master psychodynamic therapist generating precise therapeutic guidance for a voice AI therapist.
${retrievedContext}

CURRENT UTTERANCE:
"${input.utterance}"

ORIENTATION STATE REGISTER:
${osrSummary}

SESSION CONTEXT:
- Exchange: ${input.exchangeCount}
- Position: ${osr.movement.sessionPosition}
- CSS Stage: ${osr.movement.cssStage}

ANTICIPATION: Building toward "${anticipation.trajectory.buildingToward}" (phase: ${anticipation.timing.phase}, wait: ${anticipation.patience.shouldWait}, risk: ${anticipation.patience.riskOfPrematureIntervention})

SYMBOLIC: Topic "${generativeInsight.currentElaboration.topic}" (weight: ${generativeInsight.currentElaboration.symbolicWeight}, themes: ${generativeInsight.currentElaboration.connectedThemes.join(', ') || 'none'})${generativeInsight.potentialConnection ? `, connection: ${generativeInsight.potentialConnection.connectionInsight}` : ''}

KEY PRINCIPLES:
1. WAIT when anticipation says wait - Let user build material
2. Strategic patience is therapeutic - Silence and space allow discovery
3. When timing is "ready" - Consider the suggested intervention as question/reflection
4. Guide toward discovery, not delivery - User should find insight, not receive it
5. FOLLOW THE USER'S REGISTER - If the user is in Imaginary (narrative/meaning-making), guide toward Symbolic or stay in Imaginary. Do NOT redirect to Real/body unless stuckness is above 0.5 AND the user has been looping in narrative without movement. Going to body is ONE option, not the default.
6. Register direction should move FORWARD (Imaginary → Symbolic, Real → Imaginary) not backward to body unless clinically necessary
7. Use retrieved PCA/PCP guidance as background knowledge, but NEVER let it override the register direction principle above

Generate therapeutic guidance in this COMPACT JSON format only:
{
  "posture": "probe|hold|challenge|support|reflect|silent|wait_and_track",
  "registerDirection": null | {"from": "Real|Imaginary|Symbolic", "toward": "Real|Imaginary|Symbolic", "technique": "brief technique"},
  "strategicDirection": "1 sentence max",
  "avoidances": ["max 2 items"],
  "framing": "optional 1 sentence or null",
  "urgency": "low|moderate|high|immediate",
  "confidence": 0.0-1.0
}

Be extremely concise. No explanations outside the JSON.`;

  // Claude API call with timing
  const claudeStart = Date.now();
  console.log(`🤖 [Claude] Calling API...`);
  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }]
  });
  console.log(`🤖 [Claude] Response received in ${Date.now() - claudeStart}ms`);

  // Extract text content
  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Parse JSON from response with repair logic
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response');
  }

  let jsonStr = jsonMatch[0];

  // Repair common truncation issues:
  // 1. Count open/close braces and brackets
  const openBraces = (jsonStr.match(/\{/g) || []).length;
  const closeBraces = (jsonStr.match(/\}/g) || []).length;
  const openBrackets = (jsonStr.match(/\[/g) || []).length;
  const closeBrackets = (jsonStr.match(/\]/g) || []).length;

  // 2. If truncated, trim back to last complete value and close
  if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
    console.warn(`🔧 [Guidance] JSON truncated (braces: ${openBraces}/${closeBraces}, brackets: ${openBrackets}/${closeBrackets}). Attempting repair.`);

    // Remove any trailing incomplete key-value pair (e.g., `"key": "unterminated...`)
    // Find the last complete value boundary (ends with `}`, `]`, `"`, number, true/false/null, followed by comma or nothing)
    const lastGoodBoundary = jsonStr.search(/,\s*"[^"]*"\s*:\s*[^,}\]]*$/);
    if (lastGoodBoundary > 0) {
      jsonStr = jsonStr.substring(0, lastGoodBoundary);
    }

    // Close any remaining open brackets and braces
    const remainingBrackets = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length;
    const remainingBraces = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length;

    for (let i = 0; i < remainingBrackets; i++) jsonStr += ']';
    for (let i = 0; i < remainingBraces; i++) jsonStr += '}';
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    console.error(`🔧 [Guidance] JSON repair failed, extracting core fields manually`);
    // Extract the most critical fields with regex as last resort
    const postureMatch = content.text.match(/"posture"\s*:\s*"([^"]+)"/);
    const directionMatch = content.text.match(/"strategicDirection"\s*:\s*"([^"]+)"/);
    const urgencyMatch = content.text.match(/"urgency"\s*:\s*"([^"]+)"/);
    const confidenceMatch = content.text.match(/"confidence"\s*:\s*([\d.]+)/);

    if (postureMatch) {
      // We got at least posture — build a minimal valid guidance object
      parsed = {
        posture: postureMatch[1],
        strategicDirection: directionMatch ? directionMatch[1] : 'Engage with the user\'s current material',
        urgency: urgencyMatch ? urgencyMatch[1] : 'moderate',
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.6,
        avoidances: [],
        registerDirection: null,
        framing: null
      };
      console.log(`🔧 [Guidance] Recovered core fields from malformed JSON (posture: ${parsed.posture})`);
    } else {
      throw new Error('Could not extract any fields from Claude response');
    }
  }

  return {
    posture: validatePosture(parsed.posture),
    registerDirection: parsed.registerDirection ? {
      from: validateRegister(parsed.registerDirection.from),
      toward: validateRegister(parsed.registerDirection.toward),
      technique: parsed.registerDirection.technique || ''
    } : null,
    strategicDirection: parsed.strategicDirection || '',
    avoidances: Array.isArray(parsed.avoidances) ? parsed.avoidances.slice(0, 4) : [],
    framing: parsed.framing || null,
    urgency: validateUrgency(parsed.urgency),
    confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
    anticipationGuidance: parsed.anticipationGuidance || generateAnticipationGuidance(anticipation, generativeInsight),
    symbolicContext: parsed.symbolicContext || generateSymbolicContext(osr),
    enhancedPosture: parsed.enhancedPosture || {
      mode: validatePosture(parsed.posture),
      intensity: 'gentle',
      description: POSTURE_DESCRIPTIONS[validatePosture(parsed.posture)]
    },
    enhancedStrategicDirection: parsed.enhancedStrategicDirection || {
      moveToward: parsed.strategicDirection || '',
      currentGoal: anticipation.patience.shouldWait ? 'Create space' : 'Engage material',
      longerArc: anticipation.trajectory.buildingToward
    }
  };
}

/**
 * Prepare enhanced OSR summary including anticipation data
 */
function prepareEnhancedOSRSummary(osr: OrientationStateRegister): string {
  const lines: string[] = [];

  // Patterns
  if (osr.patterns.activePatterns.length > 0) {
    lines.push(`Active Patterns: ${osr.patterns.activePatterns.map(p => p.description).join('; ')}`);
  }
  if (osr.patterns.userExplicitIdentification) {
    lines.push(`User Identified: "${osr.patterns.userExplicitIdentification.statement}"`);
  }

  // Register
  lines.push(`Register: ${osr.register.currentRegister} (Stuckness: ${osr.register.stucknessScore.toFixed(2)})`);

  // Symbolic with generative insight
  if (osr.symbolic.activeMappings.length > 0) {
    lines.push(`Symbolic Activation: ${osr.symbolic.activeMappings[0].presentPattern}`);
  }
  if (osr.symbolic.awarenessShift) {
    lines.push(`Awareness Shift: ${osr.symbolic.awarenessShift.fromLevel} → ${osr.symbolic.awarenessShift.toLevel}`);
  }
  if (osr.symbolic.readyToSurface) {
    lines.push(`Ready to Surface: ${osr.symbolic.readyToSurface.mapping}`);
  }

  // Movement
  lines.push(`Trajectory: ${osr.movement.trajectory}`);
  const highIndicators = Object.entries(osr.movement.indicators)
    .filter(([_, v]) => v > 0.3)
    .map(([k, v]) => `${k}:${v.toFixed(2)}`);
  if (highIndicators.length > 0) {
    lines.push(`Indicators: ${highIndicators.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Prepare concise OSR summary for Claude
 */
function prepareOSRSummary(osr: OrientationStateRegister): string {
  const lines: string[] = [];

  // Patterns
  if (osr.patterns.activePatterns.length > 0) {
    lines.push(`Active Patterns: ${osr.patterns.activePatterns.map(p => p.description).join('; ')}`);
  }
  if (osr.patterns.userExplicitIdentification) {
    lines.push(`User Identified: "${osr.patterns.userExplicitIdentification.statement}"`);
  }

  // Register
  lines.push(`Register: ${osr.register.currentRegister} (Stuckness: ${osr.register.stucknessScore.toFixed(2)})`);

  // Symbolic
  if (osr.symbolic.activeMappings.length > 0) {
    lines.push(`Symbolic Activation: ${osr.symbolic.activeMappings[0].presentPattern}`);
  }
  if (osr.symbolic.awarenessShift) {
    lines.push(`Awareness Shift: ${osr.symbolic.awarenessShift.fromLevel} → ${osr.symbolic.awarenessShift.toLevel}`);
  }

  // Movement
  lines.push(`Trajectory: ${osr.movement.trajectory}`);
  const highIndicators = Object.entries(osr.movement.indicators)
    .filter(([_, v]) => v > 0.3)
    .map(([k, v]) => `${k}:${v.toFixed(2)}`);
  if (highIndicators.length > 0) {
    lines.push(`Indicators: ${highIndicators.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Validate and normalize posture
 */
function validatePosture(posture: string): TherapeuticPosture {
  const valid: TherapeuticPosture[] = ['probe', 'hold', 'challenge', 'support', 'reflect', 'silent', 'wait_and_track'];
  const normalized = posture?.toLowerCase() as TherapeuticPosture;
  return valid.includes(normalized) ? normalized : 'hold';
}

/**
 * Validate and normalize register
 */
function validateRegister(register: string): Register {
  const valid: Register[] = ['Real', 'Imaginary', 'Symbolic'];
  const capitalized = register?.charAt(0).toUpperCase() + register?.slice(1).toLowerCase() as Register;
  return valid.includes(capitalized) ? capitalized : 'Real';
}

/**
 * Validate and normalize urgency
 */
function validateUrgency(urgency: string): GuidanceUrgency {
  const valid: GuidanceUrgency[] = ['low', 'moderate', 'high', 'immediate'];
  const normalized = urgency?.toLowerCase() as GuidanceUrgency;
  return valid.includes(normalized) ? normalized : 'moderate';
}
