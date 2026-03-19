// server/services/sensing-layer/silence-monitor.ts
// Silence monitoring — injects silence signals for Tiers 1-3, forced speech for Tier 4

import { getCallState, isCallActive } from './call-state';
import { injectSilenceContext, injectSpokenReEngagement } from './guidance-injector';
import { getLastFooterState } from '../../prompts/pca-core';

const MAX_MONITOR_DURATION_MS = 45 * 60 * 1000;
const AGENT_QUIET_BUFFER_MS = 3000;
const MAX_SILENCE_EVENTS = 4;

interface SilenceTimer {
  timeout: NodeJS.Timeout;
  silenceEventCount: number;
  firstUserUtteranceReceived: boolean;
  monitorStartedAt: number;
  resetGeneration: number;
}

const silenceTimers = new Map<string, SilenceTimer>();

const postInterventionSuppressedUntil = new Map<string, number>();

function isPostInterventionSuppressed(callId: string): boolean {
  const suppressedUntil = postInterventionSuppressedUntil.get(callId);
  if (!suppressedUntil) return false;
  if (Date.now() < suppressedUntil) return true;
  postInterventionSuppressedUntil.delete(callId);
  return false;
}

export function suppressSilenceMonitor(callId: string, durationMs: number = 45000): void {
  postInterventionSuppressedUntil.set(callId, Date.now() + durationMs);
  console.log(`🔇 [SILENCE] Post-intervention suppression set for call ${callId} (${durationMs}ms)`);
}

export function clearPostInterventionSuppression(callId: string): void {
  const suppressedUntil = postInterventionSuppressedUntil.get(callId);
  if (suppressedUntil && Date.now() < suppressedUntil) {
    postInterventionSuppressedUntil.delete(callId);
    console.log(`🔇 [SILENCE] Post-intervention suppression cleared (user spoke) for call ${callId}`);
  }
}

function isStale(callId: string, generation: number): boolean {
  const timer = silenceTimers.get(callId);
  if (!timer) return true;
  return timer.resetGeneration !== generation;
}

function calculateSilenceThreshold(callId: string): number {
  const footer = getLastFooterState(callId);
  if (footer?.register === 'real' && footer?.movement === 'deepening') return 42_000;
  if (footer?.posture === 'impressionation') return 35_000;
  if (footer?.posture === 'fissure') return 30_000;
  if (footer?.movement === 'resistant') return 12_000;
  return 18_000;
}

function buildSilenceSignal(callId: string, silenceEventCount: number, silenceDurationSeconds: number): string {
  const footer = getLastFooterState(callId);

  if (silenceEventCount >= 3) {
    return `[SILENCE — ${silenceDurationSeconds} seconds. Silence event: third. Silence state: repeated extended pause.]`;
  }

  const register = footer?.register || 'imaginary';

  return `[SILENCE — ${silenceDurationSeconds} seconds. Register: ${register}. Silence state: sustained pause.]`;
}

const TIER4_MESSAGES = [
  "I'll be here when you're ready.",
  "Going to give you some space. Not going anywhere.",
  "Something important is happening. I'll stay quiet and let it move.",
];

function armTimer(callId: string): void {
  const timer = silenceTimers.get(callId);
  if (!timer) return;

  clearTimeout(timer.timeout);

  if (Date.now() - timer.monitorStartedAt > MAX_MONITOR_DURATION_MS) {
    console.log(`🔇 [SILENCE] Max duration reached for call ${callId}`);
    stopSilenceMonitor(callId);
    return;
  }

  const thresholdMs = calculateSilenceThreshold(callId);
  const adjustedThreshold = thresholdMs + timer.silenceEventCount * 10_000;

  console.log(`🔇 [SILENCE] Timer armed for call ${callId} (threshold: ${adjustedThreshold}ms, events: ${timer.silenceEventCount})`);

  timer.timeout = setTimeout(
    () => handleSilenceTimeout(callId, timer.resetGeneration),
    adjustedThreshold
  );
}

async function handleSilenceTimeout(callId: string, armedGeneration?: number): Promise<void> {
  const timer = silenceTimers.get(callId);
  if (!timer) return;

  const generation = armedGeneration ?? timer.resetGeneration;

  if (isStale(callId, generation)) {
    console.log(`🔇 [SILENCE] Aborting stale timeout for call ${callId}`);
    return;
  }

  if (isPostInterventionSuppressed(callId)) {
    console.log(`🔇 [SILENCE] Post-intervention suppression active for call ${callId}, re-arming`);
    armTimer(callId);
    return;
  }

  if (!isCallActive(callId)) {
    console.log(`🔇 [SILENCE] Call ${callId} no longer active`);
    stopSilenceMonitor(callId);
    return;
  }

  const callState = getCallState(callId);
  if (!callState) {
    stopSilenceMonitor(callId);
    return;
  }

  if (callState.lastAgentUtteranceAt) {
    const agentSilenceMs = Date.now() - callState.lastAgentUtteranceAt.getTime();
    if (agentSilenceMs < AGENT_QUIET_BUFFER_MS) {
      console.log(`🔇 [SILENCE] Agent spoke ${agentSilenceMs}ms ago, re-arming`);
      armTimer(callId);
      return;
    }
  }

  timer.silenceEventCount++;
  console.log(`🔇 [SILENCE] Silence event #${timer.silenceEventCount} for call ${callId}`);

  const lastActivityAt = callState.lastUserUtteranceAt ?? callState.lastAgentUtteranceAt ?? null;
  const silenceDurationMs = lastActivityAt
    ? Date.now() - lastActivityAt.getTime()
    : 0;
  const silenceDurationSeconds = Math.round(silenceDurationMs / 1000);

  // Tier 4 — hard stop, forced speech
  if (timer.silenceEventCount >= MAX_SILENCE_EVENTS) {
    const message = TIER4_MESSAGES[Math.floor(Math.random() * TIER4_MESSAGES.length)];
    console.log(`🔇 [SILENCE] Tier 4 — forced wind-down for call ${callId}: "${message}"`);
    await injectSpokenReEngagement(callId, message);
    stopSilenceMonitor(callId);
    return;
  }

  // Tiers 1, 2, 3 — inject silence context, agent generates its own response
  const signal = buildSilenceSignal(callId, timer.silenceEventCount, silenceDurationSeconds);

  if (isStale(callId, generation)) {
    console.log(`🔇 [SILENCE] Stale before injection for call ${callId}`);
    return;
  }

  const injected = await injectSilenceContext(callId, signal);

  if (isStale(callId, generation)) {
    console.log(`🔇 [SILENCE] User spoke during injection for call ${callId}`);
    return;
  }

  if (injected) {
    console.log(`🔇 [SILENCE] Event #${timer.silenceEventCount} injected for call ${callId}: "${signal}"`);
  } else {
    console.warn(`🔇 [SILENCE] Injection failed for call ${callId}`);
  }

  armTimer(callId);
}

export function startSilenceMonitor(callId: string): void {
  if (silenceTimers.has(callId)) return;

  const timer: SilenceTimer = {
    timeout: setTimeout(() => {}, 0),
    silenceEventCount: 0,
    firstUserUtteranceReceived: false,
    monitorStartedAt: Date.now(),
    resetGeneration: 0,
  };
  clearTimeout(timer.timeout);
  silenceTimers.set(callId, timer);

  armTimer(callId);
  console.log(`🔇 [SILENCE] Started monitoring for call ${callId}`);
}

export function resetSilenceTimer(callId: string): void {
  let timer = silenceTimers.get(callId);

  if (!timer) {
    startSilenceMonitor(callId);
    timer = silenceTimers.get(callId)!;
  }

  if (!timer.firstUserUtteranceReceived) {
    timer.firstUserUtteranceReceived = true;
    console.log(`🔇 [SILENCE] First user utterance for call ${callId}`);
  }

  timer.silenceEventCount = 0;
  timer.resetGeneration++;

  console.log(`🔇 [SILENCE] Generation ${timer.resetGeneration} for call ${callId}`);
  armTimer(callId);
}

export function stopSilenceMonitor(callId: string): void {
  const timer = silenceTimers.get(callId);
  if (timer) {
    clearTimeout(timer.timeout);
    silenceTimers.delete(callId);
    console.log(`🔇 [SILENCE] Stopped monitoring for call ${callId}`);
  }
  postInterventionSuppressedUntil.delete(callId);
}

export function getActiveSilenceMonitorCount(): number {
  return silenceTimers.size;
}
