// server/services/sensing-layer/guidance-injector.ts
// Injects therapeutic guidance into VAPI conversations via controlUrl

import { TherapeuticGuidance, TherapeuticPosture, EnhancedTherapeuticGuidance } from './types';
import { getControlUrl } from './call-state';

/**
 * Posture descriptions for the voice model
 */
const POSTURE_DESCRIPTIONS: Record<TherapeuticPosture, string> = {
  probe: 'Ask deepening questions to explore further. Be curious about what lies beneath.',
  hold: 'Stay with what\'s present. Don\'t push forward. Allow space for what\'s emerging.',
  challenge: 'Gently name the contradiction or gap you\'re sensing. Be direct but warm.',
  support: 'Validate their experience. Reflect strength. Provide emotional scaffolding.',
  reflect: 'Mirror back what you\'re hearing. Help them see themselves through your reflection.',
  silent: 'Allow extended silence. Sometimes presence is more powerful than words.',
  wait_and_track: 'Let them continue. They\'re building toward something. Don\'t redirect or push. Strategic patience.'
};

/**
 * Inject therapeutic guidance into a VAPI call via controlUrl
 * Supports both basic TherapeuticGuidance and EnhancedTherapeuticGuidance
 */
export async function injectGuidance(
  callId: string,
  guidance: TherapeuticGuidance | EnhancedTherapeuticGuidance
): Promise<boolean> {
  const controlUrl = getControlUrl(callId);

  if (!controlUrl) {
    console.warn(`⚠️ [GuidanceInjector] No controlUrl for call ${callId}`);
    return false;
  }

  // Check if this is enhanced guidance
  const isEnhanced = 'anticipationGuidance' in guidance || 'enhancedPosture' in guidance;
  const systemMessage = isEnhanced
    ? formatEnhancedGuidanceAsSystemMessage(guidance as EnhancedTherapeuticGuidance)
    : formatGuidanceAsSystemMessage(guidance);

  const effectivePosture = isEnhanced
    ? (guidance as EnhancedTherapeuticGuidance).enhancedPosture?.mode || guidance.posture
    : guidance.posture;

  console.log(`📤 [GuidanceInjector] Injecting ${isEnhanced ? 'enhanced ' : ''}guidance for call ${callId}`);
  console.log(`   Posture: ${effectivePosture}, Urgency: ${guidance.urgency}`);
  if (isEnhanced && (guidance as EnhancedTherapeuticGuidance).anticipationGuidance?.shouldWait) {
    console.log(`   ⏳ Strategic patience: ${(guidance as EnhancedTherapeuticGuidance).anticipationGuidance?.waitingFor}`);
  }

  try {
    const response = await fetch(controlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'add-message',
        message: {
          role: 'system',
          content: systemMessage
        },
        triggerResponseEnabled: false // Don't trigger immediate response
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`❌ [GuidanceInjector] Failed to inject guidance: ${response.status} - ${errorText}`);
      return false;
    }

    console.log(`✅ [GuidanceInjector] Guidance injected successfully for call ${callId}`);
    return true;

  } catch (error) {
    console.error(`❌ [GuidanceInjector] Error injecting guidance:`, error);
    return false;
  }
}

/**
 * Format TherapeuticGuidance as a system message for the voice model
 */
function formatGuidanceAsSystemMessage(guidance: TherapeuticGuidance): string {
  const lines: string[] = [];

  // Header with urgency indicator
  if (guidance.urgency === 'immediate' || guidance.urgency === 'high') {
    lines.push(`[⚡ THERAPEUTIC GUIDANCE - HIGH PRIORITY]`);
  } else {
    lines.push(`[THERAPEUTIC GUIDANCE]`);
  }
  lines.push('');

  // Posture instruction
  lines.push(`POSTURE: ${guidance.posture.toUpperCase()}`);
  lines.push(POSTURE_DESCRIPTIONS[guidance.posture]);
  lines.push('');

  // Register direction if present
  if (guidance.registerDirection) {
    lines.push(`REGISTER DIRECTION:`);
    lines.push(`Guide from ${guidance.registerDirection.from} → ${guidance.registerDirection.toward}`);
    if (guidance.registerDirection.technique) {
      lines.push(`Technique: ${guidance.registerDirection.technique}`);
    }
    lines.push('');
  }

  // Strategic direction
  if (guidance.strategicDirection) {
    lines.push(`DIRECTION:`);
    lines.push(guidance.strategicDirection);
    lines.push('');
  }

  // Avoidances
  if (guidance.avoidances && guidance.avoidances.length > 0) {
    lines.push(`DO NOT:`);
    guidance.avoidances.forEach(avoidance => {
      lines.push(`• ${avoidance}`);
    });
    lines.push('');
  }

  // Specific framing if provided
  if (guidance.framing) {
    lines.push(`FRAMING:`);
    lines.push(guidance.framing);
    lines.push('');
  }

  // Footer reminder
  lines.push(`---`);
  lines.push(`Confidence: ${Math.round(guidance.confidence * 100)}%`);
  lines.push(`Remember: Speak warmly and naturally. This guidance shapes WHAT you explore, not HOW you sound.`);

  return lines.join('\n');
}

/**
 * Format EnhancedTherapeuticGuidance with anticipation as a system message
 */
function formatEnhancedGuidanceAsSystemMessage(guidance: EnhancedTherapeuticGuidance): string {
  const lines: string[] = [];

  // Header with urgency indicator
  if (guidance.urgency === 'immediate' || guidance.urgency === 'high') {
    lines.push(`[⚡ THERAPEUTIC GUIDANCE - HIGH PRIORITY]`);
  } else {
    lines.push(`[THERAPEUTIC GUIDANCE]`);
  }
  lines.push('');

  // CRITICAL: Anticipation guidance (most important for strategic patience)
  if (guidance.anticipationGuidance) {
    const ag = guidance.anticipationGuidance;
    if (ag.shouldWait) {
      lines.push(`⏳ STRATEGIC PATIENCE:`);
      lines.push(`User is building toward: ${ag.userBuildingToward}`);
      lines.push(`Current phase: ${ag.currentPhase}`);
      lines.push(`WAIT. Let them continue. Don't redirect.`);
      lines.push(`Waiting for: ${ag.waitingFor}`);
      if (ag.riskIfPremature) {
        lines.push(`Risk if you intervene now: ${ag.riskIfPremature}`);
      }
      lines.push('');
    } else if (ag.potentialIntervention && ag.interventionTiming === 'ready') {
      lines.push(`🎯 INTERVENTION OPPORTUNITY:`);
      lines.push(`Consider: "${ag.potentialIntervention}"`);
      lines.push(`Frame as question/reflection. Let THEM make the connection.`);
      lines.push('');
    } else if (ag.interventionTiming === 'approaching') {
      lines.push(`📍 APPROACHING READINESS:`);
      lines.push(`User building toward: ${ag.userBuildingToward}`);
      lines.push(`Hold space. They're getting close.`);
      if (ag.potentialIntervention) {
        lines.push(`Upcoming intervention to consider: ${ag.potentialIntervention}`);
      }
      lines.push('');
    }
  }

  // Enhanced posture instruction
  if (guidance.enhancedPosture) {
    const ep = guidance.enhancedPosture;
    lines.push(`POSTURE: ${String(ep.mode).toUpperCase()} (${ep.intensity})`);
    lines.push(ep.description);
    lines.push('');
  } else {
    lines.push(`POSTURE: ${guidance.posture.toUpperCase()}`);
    lines.push(POSTURE_DESCRIPTIONS[guidance.posture]);
    lines.push('');
  }

  // Register direction if present
  if (guidance.registerDirection) {
    lines.push(`REGISTER DIRECTION:`);
    lines.push(`Guide from ${guidance.registerDirection.from} → ${guidance.registerDirection.toward}`);
    if (guidance.registerDirection.technique) {
      lines.push(`Technique: ${guidance.registerDirection.technique}`);
    }
    lines.push('');
  }

  // Enhanced strategic direction
  if (guidance.enhancedStrategicDirection) {
    const esd = guidance.enhancedStrategicDirection;
    lines.push(`DIRECTION:`);
    lines.push(`Current goal: ${esd.currentGoal}`);
    if (esd.longerArc) {
      lines.push(`Longer arc: ${esd.longerArc}`);
    }
    lines.push('');
  } else if (guidance.strategicDirection) {
    lines.push(`DIRECTION:`);
    lines.push(guidance.strategicDirection);
    lines.push('');
  }

  // Avoidances
  if (guidance.avoidances && guidance.avoidances.length > 0) {
    lines.push(`DO NOT:`);
    guidance.avoidances.forEach(avoidance => {
      lines.push(`• ${avoidance}`);
    });
    lines.push('');
  }

  // Enhanced framing if provided
  if (guidance.enhancedFraming) {
    const ef = guidance.enhancedFraming;
    lines.push(`FRAMING:`);
    if (ef.usePhrase) {
      lines.push(`Consider: "${ef.usePhrase}"`);
    }
    if (ef.avoidPhrase) {
      lines.push(`Avoid: "${ef.avoidPhrase}"`);
    }
    if (ef.toneNote) {
      lines.push(`Tone: ${ef.toneNote}`);
    }
    lines.push('');
  } else if (guidance.framing) {
    lines.push(`FRAMING:`);
    lines.push(guidance.framing);
    lines.push('');
  }

  // Symbolic context (for therapist awareness, not to speak)
  if (guidance.symbolicContext) {
    const sc = guidance.symbolicContext;
    lines.push(`SYMBOLIC CONTEXT (your awareness, NOT to say):`);
    lines.push(`Connection: ${sc.activeConnection}`);
    lines.push(`User awareness: ${sc.userAwareness}`);
    lines.push(`Note: ${sc.guidanceNote}`);
    lines.push('');
  }

  // Footer reminder
  lines.push(`---`);
  lines.push(`Confidence: ${Math.round(guidance.confidence * 100)}%`);
  lines.push(`Remember: You articulate warmly and naturally. Guide toward discovery, not delivery.`);

  return lines.join('\n');
}

/**
 * Send an immediate intervention message (for crisis/flooding situations)
 */
export async function injectImmediateIntervention(
  callId: string,
  intervention: string
): Promise<boolean> {
  const controlUrl = getControlUrl(callId);

  if (!controlUrl) {
    console.warn(`⚠️ [GuidanceInjector] No controlUrl for immediate intervention on call ${callId}`);
    return false;
  }

  console.log(`🚨 [GuidanceInjector] Injecting IMMEDIATE intervention for call ${callId}`);

  try {
    const response = await fetch(controlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'add-message',
        message: {
          role: 'system',
          content: `[🚨 IMMEDIATE - PRIORITIZE THIS]\n\n${intervention}\n\nThis takes precedence over other guidance.`
        },
        triggerResponseEnabled: false
      })
    });

    if (!response.ok) {
      console.error(`❌ [GuidanceInjector] Failed to inject intervention: ${response.status}`);
      return false;
    }

    console.log(`✅ [GuidanceInjector] Immediate intervention injected for call ${callId}`);
    return true;

  } catch (error) {
    console.error(`❌ [GuidanceInjector] Error injecting intervention:`, error);
    return false;
  }
}

/**
 * Inject a simple system message (for debugging or simple updates)
 */
export async function injectSystemMessage(
  callId: string,
  message: string
): Promise<boolean> {
  const controlUrl = getControlUrl(callId);

  if (!controlUrl) {
    return false;
  }

  try {
    const response = await fetch(controlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'add-message',
        message: {
          role: 'system',
          content: message
        },
        triggerResponseEnabled: false
      })
    });

    return response.ok;

  } catch (error) {
    console.error(`❌ [GuidanceInjector] Error injecting system message:`, error);
    return false;
  }
}
