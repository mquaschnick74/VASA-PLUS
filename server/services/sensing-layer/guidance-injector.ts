// server/services/sensing-layer/guidance-injector.ts
// Injects therapeutic guidance into VAPI conversations via controlUrl

import { TherapeuticGuidance, TherapeuticPosture } from './types';
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
  silent: 'Allow extended silence. Sometimes presence is more powerful than words.'
};

/**
 * Inject therapeutic guidance into a VAPI call via controlUrl
 */
export async function injectGuidance(
  callId: string,
  guidance: TherapeuticGuidance
): Promise<boolean> {
  const controlUrl = getControlUrl(callId);

  if (!controlUrl) {
    console.warn(`⚠️ [GuidanceInjector] No controlUrl for call ${callId}`);
    return false;
  }

  const systemMessage = formatGuidanceAsSystemMessage(guidance);

  console.log(`📤 [GuidanceInjector] Injecting guidance for call ${callId}`);
  console.log(`   Posture: ${guidance.posture}, Urgency: ${guidance.urgency}`);

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
