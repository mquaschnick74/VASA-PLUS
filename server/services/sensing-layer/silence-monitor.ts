// server/services/sensing-layer/silence-monitor.ts
// Monitors silence during active calls and triggers context-aware re-engagement

import { getCallState, getLastUserMessage } from './call-state';
import { getSessionState } from './session-state';
import { injectGuidance } from './guidance-injector';
import { TherapeuticGuidance } from './types';

// Max call duration before auto-stopping the monitor (45 minutes)
const MAX_MONITOR_DURATION_MS = 45 * 60 * 1000;
// Minimum time since agent last spoke before we inject (3 seconds)
const AGENT_QUIET_BUFFER_MS = 3000;
// Maximum re-engagement attempts before stopping
const MAX_RE_ENGAGEMENTS = 4;

interface SilenceTimer {
  timeout: NodeJS.Timeout;
  reEngagementCount: number;
  firstUserUtteranceReceived: boolean;
  monitorStartedAt: number;
}

const silenceTimers = new Map<string, SilenceTimer>();

// ============================================================================
// Re-engagement message templates
// ============================================================================

const TEMPLATES: Record<string, string[]> = {
  guided_pause: [
    "Take your time. I'm here.",
    "No rush.",
    "I'm still with you.",
    "Whenever you're ready."
  ],
  confused: [
    "What's happening for you right now?",
    "Where did that land?",
    "I'm wondering what you're noticing."
  ],
  deep_processing: [
    "I don't want to interrupt if you're still with something.",
    "Take all the time you need."
  ],
  emotional: [
    "I'm right here with you.",
    "You don't have to say anything yet.",
    "Just breathe. I've got you."
  ],
  hsfb: [
    "Stay with it.",
    "Where is it now?",
    "What do you notice?",
    "Keep breathing.",
    "What shifted?"
  ],
  default: [
    "I'm here.",
    "What's coming up?",
    "Take your time."
  ],
  escalation_2: [
    "I'm still here. What's present for you?",
    "Checking in — where are you right now?"
  ],
  escalation_3: [
    "Would you like to keep going, or would a pause help?",
    "We can slow down if you need."
  ],
  final_normal: [
    "I'll be here when you're ready. Take all the time you need.",
    "I'm going to give you some space. I'm not going anywhere."
  ],
  final_deep: [
    "Something important is happening. I'll stay quiet and let it move.",
    "You're in something deep. Take as long as you need."
  ]
};

// ============================================================================
// Language detection helpers
// ============================================================================

function containsSomaticLanguage(msg: string): boolean {
  if (!msg) return false;
  const patterns = [
    /feel(s|ing)?\s+(it\s+)?in\s+my/i,
    /tight(ness)?/i,
    /chest|stomach|throat|shoulders|jaw/i,
    /body/i, /breath(e|ing)?/i, /sensation/i,
    /numb/i, /heavy|heaviness/i, /shaking|trembling/i
  ];
  return patterns.some(p => p.test(msg));
}

function containsVisualizationLanguage(msg: string): boolean {
  if (!msg) return false;
  const patterns = [
    /i (see|saw|picture|imagine|visualize)/i,
    /it looks like/i, /color(ed)?/i,
    /dark|bright|light/i, /shape|form/i,
    /glass|smoke|fire|water/i
  ];
  return patterns.some(p => p.test(msg));
}

// ============================================================================
// Threshold calculation
// ============================================================================

function isInHSFBWork(callId: string, lastMessage: string | undefined): boolean {
  const session = getSessionState(callId);
  return (
    session?.latestRegister?.currentRegister === 'Real' ||
    containsSomaticLanguage(lastMessage || '') ||
    containsVisualizationLanguage(lastMessage || '')
  );
}

function calculateSilenceThreshold(callId: string): number {
  const session = getSessionState(callId);
  const lastMessage = getLastUserMessage(callId);

  // HSFB/somatic work: 40-45 seconds
  if (isInHSFBWork(callId, lastMessage)) return 42_000;

  // Deep processing: 30-35 seconds
  if (session?.latestMovement?.indicators?.deepening && session.latestMovement.indicators.deepening > 0.4) return 35_000;
  if (session?.latestMovement?.trajectory === 'toward_mastery') return 30_000;

  // Hold/silent posture: 20-25 seconds
  if (session?.latestGuidance?.posture === 'hold' || session?.latestGuidance?.posture === 'silent') return 22_000;

  // Confused/deflecting: 10-12 seconds
  if (lastMessage && lastMessage.length < 15) return 10_000;
  if (session?.latestMovement?.indicators?.resistance && session.latestMovement.indicators.resistance > 0.4) return 12_000;
  if (session?.latestGuidance?.posture === 'support') return 12_000;

  // Default
  return 18_000;
}

// ============================================================================
// Template selection
// ============================================================================

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function selectReEngagementMessage(callId: string, reEngagementCount: number): string {
  // Escalation tiers
  if (reEngagementCount === 2) return pickRandom(TEMPLATES.escalation_2);
  if (reEngagementCount === 3) return pickRandom(TEMPLATES.escalation_3);
  if (reEngagementCount >= 4) {
    const session = getSessionState(callId);
    const isDeep = (
      (session?.latestMovement?.indicators?.deepening && session.latestMovement.indicators.deepening > 0.5) ||
      session?.latestRegister?.currentRegister === 'Real'
    );
    return pickRandom(isDeep ? TEMPLATES.final_deep : TEMPLATES.final_normal);
  }

  // First re-engagement: pick category based on context
  const session = getSessionState(callId);
  const lastMessage = getLastUserMessage(callId);

  if (isInHSFBWork(callId, lastMessage)) return pickRandom(TEMPLATES.hsfb);

  if (session?.latestMovement?.indicators?.deepening && session.latestMovement.indicators.deepening > 0.4) {
    return pickRandom(TEMPLATES.deep_processing);
  }

  if (session?.latestMovement?.indicators?.flooding && session.latestMovement.indicators.flooding > 0.3) {
    return pickRandom(TEMPLATES.emotional);
  }

  if (lastMessage && lastMessage.length < 15) {
    return pickRandom(TEMPLATES.confused);
  }

  if (session?.latestGuidance?.posture === 'hold' || session?.latestGuidance?.posture === 'silent') {
    return pickRandom(TEMPLATES.guided_pause);
  }

  return pickRandom(TEMPLATES.default);
}

// ============================================================================
// Core timer logic
// ============================================================================

function armTimer(callId: string): void {
  const timer = silenceTimers.get(callId);
  if (!timer || !timer.firstUserUtteranceReceived) return;

  // Clear existing timeout
  clearTimeout(timer.timeout);

  // Check max duration
  if (Date.now() - timer.monitorStartedAt > MAX_MONITOR_DURATION_MS) {
    console.log(`🔇 [SILENCE] Max duration reached for call ${callId}, stopping monitor`);
    stopSilenceMonitor(callId);
    return;
  }

  const thresholdMs = calculateSilenceThreshold(callId);
  // Add 10 seconds per re-engagement to give more space each time
  const adjustedThreshold = thresholdMs + (timer.reEngagementCount * 10_000);

  console.log(`🔇 [SILENCE] Timer reset for call ${callId} (threshold: ${adjustedThreshold}ms)`);

  timer.timeout = setTimeout(() => handleSilenceTimeout(callId), adjustedThreshold);
}

async function handleSilenceTimeout(callId: string): Promise<void> {
  const timer = silenceTimers.get(callId);
  if (!timer) return;

  const callState = getCallState(callId);
  if (!callState) {
    console.log(`🔇 [SILENCE] No call state for ${callId}, stopping monitor`);
    stopSilenceMonitor(callId);
    return;
  }

  // Check if the agent spoke recently — don't interrupt
  if (callState.lastAgentUtteranceAt) {
    const agentSilenceMs = Date.now() - callState.lastAgentUtteranceAt.getTime();
    if (agentSilenceMs < AGENT_QUIET_BUFFER_MS) {
      console.log(`🔇 [SILENCE] Agent spoke ${agentSilenceMs}ms ago for call ${callId}, re-arming`);
      armTimer(callId);
      return;
    }
  }

  timer.reEngagementCount++;
  console.log(`🔇 [SILENCE] Firing re-engagement #${timer.reEngagementCount} for call ${callId}`);

  const message = selectReEngagementMessage(callId, timer.reEngagementCount);

  // Build a minimal guidance object for the re-engagement
  const guidance: TherapeuticGuidance = {
    posture: 'hold',
    registerDirection: null,
    strategicDirection: message,
    avoidances: ['Do not ask multiple questions', 'Do not interpret or analyze'],
    framing: message,
    urgency: timer.reEngagementCount >= 3 ? 'moderate' : 'low',
    confidence: 0.8
  };

  const injected = await injectGuidance(callId, guidance, true);
  if (injected) {
    console.log(`🔇 [SILENCE] Re-engagement injected for call ${callId}: "${message}"`);
  } else {
    console.warn(`🔇 [SILENCE] Failed to inject re-engagement for call ${callId}`);
  }

  // Stop after max re-engagements
  if (timer.reEngagementCount >= MAX_RE_ENGAGEMENTS) {
    console.log(`🔇 [SILENCE] Max re-engagements (${MAX_RE_ENGAGEMENTS}) reached for call ${callId}, stopping monitor`);
    stopSilenceMonitor(callId);
    return;
  }

  // Re-arm for next potential silence
  armTimer(callId);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Start silence monitoring for a call.
 * Called once on call-started — timer won't arm until first user utterance.
 */
export function startSilenceMonitor(callId: string): void {
  // Don't double-start
  if (silenceTimers.has(callId)) return;

  silenceTimers.set(callId, {
    timeout: setTimeout(() => {}, 0), // placeholder, cleared immediately
    reEngagementCount: 0,
    firstUserUtteranceReceived: false,
    monitorStartedAt: Date.now()
  });
  clearTimeout(silenceTimers.get(callId)!.timeout);

  console.log(`🔇 [SILENCE] Started monitoring for call ${callId} (waiting for first user utterance)`);
}

/**
 * Reset the silence timer. Called on each user message.
 * On the first call, this arms the timer for the first time.
 */
export function resetSilenceTimer(callId: string): void {
  let timer = silenceTimers.get(callId);

  // If monitor wasn't started yet (e.g. call-started was missed), start it
  if (!timer) {
    startSilenceMonitor(callId);
    timer = silenceTimers.get(callId)!;
  }

  // Mark first user utterance received and reset count
  if (!timer.firstUserUtteranceReceived) {
    timer.firstUserUtteranceReceived = true;
    console.log(`🔇 [SILENCE] First user utterance received for call ${callId}, arming timer`);
  }

  // Reset re-engagement count on any new user speech
  timer.reEngagementCount = 0;

  armTimer(callId);
}

/**
 * Stop silence monitoring for a call.
 * Called on end-of-call-report or when max re-engagements reached.
 */
export function stopSilenceMonitor(callId: string): void {
  const timer = silenceTimers.get(callId);
  if (timer) {
    clearTimeout(timer.timeout);
    silenceTimers.delete(callId);
    console.log(`🔇 [SILENCE] Stopped monitoring for call ${callId}`);
  }
}

/**
 * Get count of active silence monitors (for debugging)
 */
export function getActiveSilenceMonitorCount(): number {
  return silenceTimers.size;
}
