// server/services/sensing-layer/guidance-injector.ts
// Injects therapeutic guidance into VAPI conversations via controlUrl

import { TherapeuticGuidance, TherapeuticPosture, EnhancedTherapeuticGuidance, RegisterAnalysisResult, MovementAssessmentResult } from './types';
import { TherapeuticStateVector } from './state-vector';
import type { ResonanceResult } from './narrative-web';
import { getControlUrl, getCallState, getAgentSpeakingState, isCallActive } from './call-state';
import { getSessionState, getActiveIBMCandidates } from './session-state';

// Pending guidance queue: holds guidance deferred while agent is speaking
const pendingGuidance = new Map<string, TherapeuticGuidance | EnhancedTherapeuticGuidance>();
const pendingTriggerResponse = new Map<string, boolean>();
// Deduplication: track last injected system message hash per call
// Prevents double-injection when speech-update and conversation-update arrive close together
const lastInjectedHash = new Map<string, { hash: string; timestamp: number }>();
const DEDUP_WINDOW_MS = 12000; // 12 seconds — wider than any realistic event gap

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

function hashString(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

/**
 * Inject therapeutic guidance into a VAPI call via controlUrl
 * Supports both basic TherapeuticGuidance and EnhancedTherapeuticGuidance
 */
export async function injectGuidance(
  callId: string,
  guidance: TherapeuticGuidance | EnhancedTherapeuticGuidance,
  triggerResponse: boolean = false
): Promise<boolean> {
  // ACTIVE-CALL GATE: Refuse injection if call is not active
  if (!isCallActive(callId)) {
    console.warn(`⚠️ GUIDANCE: call not active, skipping`, { callId, status: getCallState(callId)?.status || 'no_state' });
    return false;
  }

  // Get the tracked controlUrl (always the freshest from webhook events)
  const controlUrl = (getControlUrl(callId) || '').trim().replace(/^<|>$/g, '');
  if (!controlUrl.startsWith('https://')) {
    console.error(`🛑 GUIDANCE: missing/invalid controlUrl`, { callId, controlUrl: controlUrl.substring(0, 40) });
    return false;
  }

  // Gate: Don't inject while agent is actively speaking (unless triggerResponse forces it)
  if (getAgentSpeakingState(callId) && !triggerResponse) {
    console.log(`🚦 [GATE] Agent is speaking for call ${callId}, queuing guidance (posture: ${guidance.posture})`);
    pendingGuidance.set(callId, guidance);
    pendingTriggerResponse.set(callId, triggerResponse);
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

  // Deduplication: skip if identical content was already injected within the window
  const msgHash = hashString(systemMessage);
  const lastInject = lastInjectedHash.get(callId);
  if (lastInject && lastInject.hash === msgHash && (Date.now() - lastInject.timestamp) < DEDUP_WINDOW_MS) {
    console.log(`⏭️ [GuidanceInjector] Skipping duplicate guidance for call ${callId} (posture: ${effectivePosture}, ${Math.round((Date.now() - lastInject.timestamp) / 1000)}s ago)`);
    return false;
  }

  console.log(`📤 [GuidanceInjector] Injecting ${isEnhanced ? 'enhanced ' : ''}guidance for call ${callId}`);
  console.log(`   Posture: ${effectivePosture}, Urgency: ${guidance.urgency}`);

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
        triggerResponseEnabled: false
      })
    });

    const responseText = await response.text().catch(() => '');

    if (!response.ok) {
      console.error(`❌ [GuidanceInjector] controlUrl inject failed`, {
        callId,
        status: response.status,
        body: responseText.slice(0, 800),
        controlUrl: controlUrl.substring(0, 80),
        posture: effectivePosture
      });
      return false;
    }

    console.log(`✅ GUIDANCE injected`, { callId, posture: effectivePosture });
    lastInjectedHash.set(callId, { hash: msgHash, timestamp: Date.now() });
    return true;

  } catch (error) {
    console.error(`❌ [GuidanceInjector] Error injecting guidance:`, error);
    return false;
  }
}

/**
 * Format TherapeuticGuidance as a system message for the voice model
 */
export function formatGuidanceAsSystemMessage(guidance: TherapeuticGuidance): string {
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
 * Format a perceptual session picture for the agent — describes the clinical field,
 * not directives. Used by the custom-LLM fast path.
 */
export function formatSessionPicture(
  guidance: TherapeuticGuidance,
  register: RegisterAnalysisResult,
  movement: MovementAssessmentResult,
  stateVector: TherapeuticStateVector,
  exchangeCount: number,
  callId: string,
  resonance?: ResonanceResult | null
): string {
  const cssStageLabels: Record<string, string> = {
    pointed_origin: 'Pointed Origin',
    focus_bind: 'Focus/Bind',
    suspension: 'Suspension',
    gesture_toward: 'Gesture Toward',
    completion: 'Completion',
    terminal: 'Terminal'
  };

  const stuckLabel = register.stucknessScore > 0.6 ? 'high stuckness' :
                     register.stucknessScore > 0.35 ? 'moderate stuckness' : 'fluid';

  const movementLabel = movement.trajectory === 'toward_mastery' ? 'deepening' :
                        movement.trajectory === 'away_from_mastery' ? 'resisting' :
                        movement.trajectory === 'cycling' ? 'cycling' : 'holding';

  const cssLabel = cssStageLabels[stateVector.coupled.cssStage] ?? stateVector.coupled.cssStage;
  const proximity = stateVector.coupled.phaseTransitionProximity.toFixed(2);

  const confidenceLabel = guidance.confidence >= 0.7 ? 'high' :
                          guidance.confidence >= 0.45 ? 'moderate' : 'low';

  // Pull accumulated patterns from background cascade
  const sessionState = getSessionState(callId);
  const accumulatedPatterns = sessionState?.patternsThisSession ?? [];

  // Surface structural flags
  const psychoticFlags = ['hallucination', 'psychotic', 'dissociative', 'voices', 'reality'];
  const structuralFlag = accumulatedPatterns.some(p =>
    psychoticFlags.some(flag => p.toLowerCase().includes(flag))
  ) ? 'Symbolic impairment signals present — stabilization priority' : null;

  const patternSummary = accumulatedPatterns.length > 0
    ? accumulatedPatterns.slice(-3).join('; ')
    : 'none accumulated yet';

  const cssStage = stateVector.coupled.cssStage;

  const toolAvailability =
    cssStage === 'pointed_origin'
      ? 'Tools: Prescripting only. HSFB not available. No somatic checks.'
      : cssStage === 'focus_bind'
      ? 'Tools: Prescripting. HSFB available if stuckness confirmed.'
      : 'Tools: Prescripting. HSFB available.';

  const postureDirective = guidance.posture
    ? `Posture this turn: ${guidance.posture.toUpperCase()} — execute in your own voice.`
    : null;

  const lines = [
    `[SESSION PICTURE — Exchange ${exchangeCount}]`,
    `Register: ${register.currentRegister} foregrounded. ${stuckLabel}.`,
    `Movement: ${movementLabel}.`,
    `CSS: ${cssLabel} / Phase proximity: ${proximity}`,
    `CVDC: not yet visible`,
    (() => {
      const ibmCandidates = getActiveIBMCandidates(callId);
      if (ibmCandidates.length === 0) return `IBM: none detected`;
      const viable = ibmCandidates.find(c => c.status === 'viable');
      if (viable) {
        return `IBM: ${viable.hypothesis} — viable [register: ${viable.viableRegister}]`;
      }
      const accumulating = ibmCandidates[0];
      return `IBM: ${accumulating.hypothesis} — held [accumulation: ${accumulating.weightedAccumulation.toFixed(2)}/2.0]`;
    })(),
    (() => {
      if (!resonance || resonance.matchedFragments.length === 0) {
        return 'Narrative: no resonance detected';
      }
      const top = resonance.matchedFragments[0];
      const stage = top.css_stage_at_disclosure ? ` [${top.css_stage_at_disclosure}]` : '';
      const signals = top.investment_signals?.length > 0
        ? ` — ${top.investment_signals.slice(0, 2).join(', ')}`
        : '';
      const constellation = resonance.isConstellationActive ? ' ◈ constellation active' : '';
      return `Narrative: ${top.content_summary}${stage}${signals}${constellation}`;
    })(),
    `Patterns: ${patternSummary}`,
    `Confidence: ${confidenceLabel}`,
    toolAvailability,
    ...(postureDirective ? [postureDirective] : []),
  ];

  if (structuralFlag) {
    lines.splice(1, 0, `⚠️ STRUCTURAL: ${structuralFlag}`);
  }

  return lines.join('\n');
}

/**
 * Format EnhancedTherapeuticGuidance with anticipation as a system message
 */
export function formatEnhancedGuidanceAsSystemMessage(guidance: EnhancedTherapeuticGuidance): string {
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
  if (!isCallActive(callId)) {
    console.warn(`⚠️ [GuidanceInjector] Call not active for immediate intervention on ${callId}`);
    return false;
  }

  const controlUrl = (getControlUrl(callId) || '').trim().replace(/^<|>$/g, '');
  if (!controlUrl.startsWith('https://')) {
    console.error(`🛑 [GuidanceInjector] No valid controlUrl for immediate intervention on call ${callId}`);
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
 * Inject a spoken re-engagement message via Vapi's "say" command.
 * Unlike add-message, "say" forces the assistant to speak the exact text immediately.
 * Used exclusively by the silence monitor — regular guidance should use injectGuidance().
 */
export async function injectSpokenReEngagement(
  callId: string,
  message: string,
  endCallAfterSpoken: boolean = false
): Promise<boolean> {
  if (!isCallActive(callId)) {
    console.warn(`⚠️ [SAY] Call not active, skipping spoken re-engagement`, { callId });
    return false;
  }

  const controlUrl = (getControlUrl(callId) || '').trim().replace(/^<|>$/g, '');
  if (!controlUrl.startsWith('https://')) {
    console.error(`🛑 [SAY] No valid controlUrl for spoken re-engagement on call ${callId}`);
    return false;
  }

  console.log(`🗣️ [SAY] Injecting spoken re-engagement for call ${callId}: "${message}"`);

  try {
    const response = await fetch(controlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'say',
        content: message,
        endCallAfterSpoken: endCallAfterSpoken
      })
    });

    const responseText = await response.text().catch(() => '');

    if (!response.ok) {
      console.error(`❌ [SAY] Failed to inject spoken re-engagement`, {
        callId,
        status: response.status,
        body: responseText.slice(0, 800)
      });
      return false;
    }

    console.log(`✅ [SAY] Spoken re-engagement injected for call ${callId}`);
    return true;

  } catch (error) {
    console.error(`❌ [SAY] Error injecting spoken re-engagement:`, error);
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
  if (!isCallActive(callId)) return false;

  const controlUrl = (getControlUrl(callId) || '').trim().replace(/^<|>$/g, '');
  if (!controlUrl.startsWith('https://')) return false;

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

/**
 * Flush pending guidance that was queued while agent was speaking
 * Called when agent stops speaking (speech-update: stopped)
 */
export async function flushPendingGuidance(callId: string): Promise<void> {
  const pending = pendingGuidance.get(callId);
  if (!pending) return;

  const triggerResponse = pendingTriggerResponse.get(callId) ?? false;

  // Clear from queue BEFORE injecting to prevent loops
  pendingGuidance.delete(callId);
  pendingTriggerResponse.delete(callId);

  console.log(`🚦 [GATE] Flushing pending guidance for call ${callId} (posture: ${pending.posture})`);
  await injectGuidance(callId, pending, triggerResponse);
}

/**
 * Clear pending guidance for a call (cleanup on call end)
 */
export function clearPendingGuidance(callId: string): void {
  pendingGuidance.delete(callId);
  pendingTriggerResponse.delete(callId);
  lastInjectedHash.delete(callId);
}

/**
 * Inject a silence signal into the conversation via VAPI add-message.
 * Triggers the agent to generate its own response using PCA framework knowledge.
 * Used for silence Tiers 1, 2, and 3.
 * Tier 4 continues to use injectSpokenReEngagement.
 */
export async function injectSilenceContext(
  callId: string,
  silenceSignal: string
): Promise<boolean> {
  if (!isCallActive(callId)) {
    console.warn(`⚠️ [SILENCE-INJECT] Call not active, skipping`, { callId });
    return false;
  }

  const controlUrl = (getControlUrl(callId) || '').trim().replace(/^<|>$/g, '');
  if (!controlUrl.startsWith('https://')) {
    console.error(`🛑 [SILENCE-INJECT] No valid controlUrl for call ${callId}`);
    return false;
  }

  console.log(`🔇 [SILENCE-INJECT] Injecting silence context for call ${callId}: "${silenceSignal}"`);

  try {
    const response = await fetch(controlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'add-message',
        message: {
          role: 'system',
          content: silenceSignal,
        },
        triggerResponseEnabled: true,
      }),
    });

    const responseText = await response.text().catch(() => '');

    if (!response.ok) {
      console.error(`❌ [SILENCE-INJECT] Failed`, {
        callId,
        status: response.status,
        body: responseText.slice(0, 400),
      });
      return false;
    }

    console.log(`✅ [SILENCE-INJECT] Injected for call ${callId}`);
    return true;
  } catch (error) {
    console.error(`❌ [SILENCE-INJECT] Error:`, error);
    return false;
  }
}
