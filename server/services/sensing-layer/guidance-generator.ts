// server/services/sensing-layer/guidance-generator.ts
// Therapeutic Guidance Generator for the Sensing Layer
// Uses Claude to generate context-aware therapeutic guidance

import Anthropic from '@anthropic-ai/sdk';
import {
  TurnInput,
  OrientationStateRegister,
  TherapeuticGuidance,
  TherapeuticPosture,
  RegisterDirection,
  GuidanceUrgency,
  Register
} from './types';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Generate therapeutic guidance based on the Orientation State Register
 */
export async function generateGuidance(
  osr: OrientationStateRegister,
  input: TurnInput
): Promise<TherapeuticGuidance> {
  console.log(`🎯 [Guidance Generator] Generating guidance for user: ${input.userId}`);

  const startTime = Date.now();

  // 1. First, try rule-based guidance for speed
  const ruleBasedGuidance = generateRuleBasedGuidance(osr, input);

  // 2. If situation is complex, enhance with Claude
  const isComplex = isComplexSituation(osr);

  if (isComplex && process.env.ANTHROPIC_API_KEY) {
    try {
      const claudeGuidance = await generateClaudeGuidance(osr, input);
      console.log(`🎯 [Guidance Generator] Claude guidance generated (${Date.now() - startTime}ms)`);
      return claudeGuidance;
    } catch (error) {
      console.error('🎯 [Guidance Generator] Claude failed, using rule-based:', error);
    }
  }

  console.log(`🎯 [Guidance Generator] Rule-based guidance generated (${Date.now() - startTime}ms)`);
  return ruleBasedGuidance;
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
 * Generate enhanced guidance using Claude
 */
async function generateClaudeGuidance(
  osr: OrientationStateRegister,
  input: TurnInput
): Promise<TherapeuticGuidance> {
  // Prepare concise OSR summary
  const osrSummary = prepareOSRSummary(osr);

  const prompt = `You are a master psychodynamic therapist generating precise therapeutic guidance for a voice AI therapist.

CURRENT UTTERANCE:
"${input.utterance}"

ORIENTATION STATE REGISTER:
${osrSummary}

SESSION CONTEXT:
- Exchange: ${input.exchangeCount}
- Position: ${osr.movement.sessionPosition}
- CSS Stage: ${osr.movement.cssStage}

Generate therapeutic guidance in this exact JSON format:
{
  "posture": "probe|hold|challenge|support|reflect|silent",
  "registerDirection": null | {
    "from": "Real|Imaginary|Symbolic",
    "toward": "Real|Imaginary|Symbolic",
    "technique": "specific technique"
  },
  "strategicDirection": "1-2 sentence direction",
  "avoidances": ["avoid 1", "avoid 2"],
  "framing": "optional specific framing suggestion or null",
  "urgency": "low|moderate|high|immediate",
  "confidence": 0.0-1.0
}

Be concise and clinically precise. Focus on the most therapeutically relevant guidance.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }]
  });

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
    confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7))
  };
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
  const valid: TherapeuticPosture[] = ['probe', 'hold', 'challenge', 'support', 'reflect', 'silent'];
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
