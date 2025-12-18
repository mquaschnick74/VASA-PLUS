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

  // 3. If situation is complex, enhance with Claude
  const isComplex = isComplexSituation(osr);

  if (isComplex && process.env.ANTHROPIC_API_KEY) {
    try {
      // Wrap Claude call in timeout to ensure fast response
      const claudeTimeout = 8000; // 8 second max for Claude + RAG
      const claudePromise = generateEnhancedClaudeGuidance(osr, input);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Claude guidance timeout')), claudeTimeout);
      });

      const claudeGuidance = await Promise.race([claudePromise, timeoutPromise]);
      console.log(`🎯 [Guidance Generator] Enhanced Claude guidance generated (${Date.now() - startTime}ms)`);
      return claudeGuidance;
    } catch (error: any) {
      if (error.message === 'Claude guidance timeout') {
        console.warn(`🎯 [Guidance Generator] Claude timed out after 8s, using rule-based`);
      } else {
        console.error('🎯 [Guidance Generator] Claude failed, using rule-based:', error);
      }
    }
  }

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
 * Check if the situation requires Claude for nuanced guidance
 */
function isComplexSituation(osr: OrientationStateRegister): boolean {
  // Complex if:
  // 1. Multiple active patterns
  if (osr.patterns.activePatterns.length >= 2) return true;

  // 2. Active symbolic mappings
  if (osr.symbolic.activeMappings.length > 0) return true;

  // 3. User showing awareness shift
  if (osr.symbolic.awarenessShift) return true;

  // 4. High stuckness
  if (osr.register.stucknessScore > 0.6) return true;

  // 5. Flooding or strong resistance
  if (osr.movement.indicators.flooding > 0.4) return true;
  if (osr.movement.indicators.resistance > 0.4) return true;

  // 6. Late stage CSS
  if (['gesture_toward', 'completion', 'terminal'].includes(osr.movement.cssStage)) return true;

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

  // Stuck in Imaginary → guide toward Real
  if (register.currentRegister === 'Imaginary') {
    return {
      from: 'Imaginary',
      toward: 'Real',
      technique: 'Invite body awareness: "What do you notice in your body as you share this?"'
    };
  }

  // Stuck in Symbolic (intellectualizing) → guide toward Real
  if (register.currentRegister === 'Symbolic' &&
      register.indicators.symbolicIndicators.some(i => i.startsWith('intellectual:'))) {
    return {
      from: 'Symbolic',
      toward: 'Real',
      technique: 'Ground the insight: "Where do you feel that understanding in your body?"'
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

  // Prepare concise OSR summary with anticipation data
  const osrSummary = prepareEnhancedOSRSummary(osr);

  // RAG: Retrieve relevant PCA/PCP guidance (with timing)
  let retrievedContext = '';
  const ragStart = Date.now();
  try {
    const ragResult = await getRelevantGuidance(osr);
    const ragTime = Date.now() - ragStart;
    if (ragResult.chunks.length > 0) {
      retrievedContext = ragResult.context;
      console.log(`🧠 [RAG] Retrieved ${ragResult.chunks.length} chunks in ${ragTime}ms`);
    } else {
      console.log(`🧠 [RAG] No chunks retrieved (${ragTime}ms) - knowledge base may be empty`);
    }
  } catch (error) {
    console.warn(`🧠 [RAG] Failed after ${Date.now() - ragStart}ms:`, error);
  }

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

ANTICIPATION STATE:
- Building toward: ${anticipation.trajectory.buildingToward}
- Trajectory confidence: ${anticipation.trajectory.trajectoryConfidence}
- Current phase: ${anticipation.timing.phase}
- Should wait: ${anticipation.patience.shouldWait}
- Waiting for: ${anticipation.patience.waitingFor}
- Risk if premature: ${anticipation.patience.riskOfPrematureIntervention}
- Estimated turns to ready: ${anticipation.timing.estimatedTurnsToReady}

GENERATIVE INSIGHT:
- User elaborating: ${generativeInsight.currentElaboration.topic}
- Symbolic weight: ${generativeInsight.currentElaboration.symbolicWeight}
- Themes: ${generativeInsight.currentElaboration.connectedThemes.join(', ') || 'none'}
${generativeInsight.potentialConnection ? `
- Potential connection: ${generativeInsight.potentialConnection.connectionInsight}
- Suggested intervention: ${generativeInsight.potentialConnection.suggestedIntervention || 'none'}
- Intervention timing: ${generativeInsight.potentialConnection.interventionTiming}
` : '- No potential connection identified'}

KEY PRINCIPLES:
1. WAIT when anticipation says wait - Let user build material
2. Strategic patience is therapeutic - Silence and space allow discovery
3. When timing is "ready" - Consider the suggested intervention as question/reflection
4. Guide toward discovery, not delivery - User should find insight, not receive it
5. Register movement matters - If stuck, guide movement
6. Use the retrieved PCA/PCP guidance above to inform your recommendations (if any)

Generate therapeutic guidance in this exact JSON format:
{
  "posture": "probe|hold|challenge|support|reflect|silent|wait_and_track",
  "registerDirection": null | {
    "from": "Real|Imaginary|Symbolic",
    "toward": "Real|Imaginary|Symbolic",
    "technique": "specific technique"
  },
  "strategicDirection": "1-2 sentence direction",
  "avoidances": ["avoid 1", "avoid 2"],
  "framing": "optional specific framing suggestion or null",
  "urgency": "low|moderate|high|immediate",
  "confidence": 0.0-1.0,
  "anticipationGuidance": {
    "userBuildingToward": "what they're building",
    "currentPhase": "the phase",
    "shouldWait": true/false,
    "waitingFor": "if waiting, what for",
    "potentialIntervention": "if ready, what to consider",
    "interventionTiming": "timing assessment",
    "riskIfPremature": "what could go wrong"
  },
  "symbolicContext": {
    "activeConnection": "for awareness, not to speak",
    "userAwareness": "where user is",
    "guidanceNote": "how to handle"
  },
  "enhancedPosture": {
    "mode": "posture mode",
    "intensity": "gentle|moderate|firm",
    "description": "what to do"
  },
  "enhancedStrategicDirection": {
    "moveToward": "therapeutic goal",
    "currentGoal": "this turn's goal",
    "longerArc": "where this is headed"
  }
}

Be concise and clinically precise. Focus on the most therapeutically relevant guidance.`;

  // Claude API call with timing
  const claudeStart = Date.now();
  console.log(`🤖 [Claude] Calling API...`);
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }]
  });
  console.log(`🤖 [Claude] Response received in ${Date.now() - claudeStart}ms`);

  // Extract text content
  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Parse JSON from response
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Claude response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

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
