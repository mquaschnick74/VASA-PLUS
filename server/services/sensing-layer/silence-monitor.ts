// server/services/sensing-layer/silence-monitor.ts
// Monitors silence during active calls and triggers context-aware re-engagement

import Anthropic from '@anthropic-ai/sdk';
import { getCallState, getLastUserMessage, getConversationHistory, isSensingProcessing } from './call-state';
import { getSessionState } from './session-state';
import { injectSpokenReEngagement } from './guidance-injector';
import { queryKnowledgeBase, buildRetrievedContext } from './knowledge-base';

// Initialize Anthropic client (shared with guidance-generator)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Max call duration before auto-stopping the monitor (45 minutes)
const MAX_MONITOR_DURATION_MS = 45 * 60 * 1000;
// Minimum time since agent last spoke before we inject (3 seconds)
const AGENT_QUIET_BUFFER_MS = 3000;
// Maximum re-engagement attempts before stopping
const MAX_RE_ENGAGEMENTS = 4;
// Timeout for Claude API calls in silence re-engagement (8 seconds)
const CLAUDE_TIMEOUT_MS = 8000;

interface SilenceTimer {
  timeout: NodeJS.Timeout;
  reEngagementCount: number;
  firstUserUtteranceReceived: boolean;
  monitorStartedAt: number;
  lastDeepening: number;
  // FIX: Generation counter — incremented every time resetSilenceTimer is called.
  // handleSilenceTimeout captures this at start and checks after every await.
  // If it changes mid-execution, the user spoke and this timeout is stale.
  resetGeneration: number;
}

const silenceTimers = new Map<string, SilenceTimer>();

// ============================================================================
// Re-engagement message templates (used for Tier 3, 4, and fallbacks)
// ============================================================================

const TEMPLATES: Record<string, string[]> = {
  guided_pause: [
    "No need to fill this space.",
    "This quiet is fine.",
    "Sitting with you in this.",
    "Whenever something comes."
  ],
  confused: [
    "What's happening for you right now?",
    "Where did that land?",
    "I'm wondering what you're noticing."
  ],
  deep_processing: [
    "I don't want to interrupt if you're still with something.",
    "Something's moving. Stay with it."
  ],
  emotional: [
    "You don't have to say anything yet.",
    "That landed somewhere. Let it sit.",
    "Just breathe."
  ],
  hsfb: [
    "Stay with it.",
    "Where is it now?",
    "What do you notice?",
    "Keep breathing.",
    "What shifted?"
  ],
  default: [
    "What's coming up?",
    "Still here.",
    "Yeah."
  ],
  escalation_2: [
    "What's present for you right now?",
    "Checking in — where are you right now?"
  ],
  escalation_3: [
    "Would you like to keep going, or would a pause help?",
    "We can slow down if you need."
  ],
  final_normal: [
    "I'll be here when you're ready.",
    "Going to give you some space. Not going anywhere."
  ],
  final_deep: [
    "Something important is happening. I'll stay quiet and let it move.",
    "You're in something deep. No rush at all."
  ]
};

// ============================================================================
// Language detection helpers (secondary signal — demoted from primary)
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

/**
 * FIX: Check if a silence timeout chain is stale.
 * Returns true if the user has spoken since this chain started
 * (i.e., resetSilenceTimer was called, incrementing the generation).
 */
function isStale(callId: string, generation: number): boolean {
  const timer = silenceTimers.get(callId);
  if (!timer) return true;
  return timer.resetGeneration !== generation;
}

// ============================================================================
// Threshold calculation
// ============================================================================

/**
 * MOD 3: Register-primary HSFB detection
 * PRIMARY: Real register + deepening > 0.3
 * SECONDARY: Somatic/visualization regex + deepening > 0.2
 */
function isInHSFBWork(callId: string, lastMessage: string | undefined): boolean {
  const session = getSessionState(callId);
  const deepening = session?.latestMovement?.indicators?.deepening ?? 0;

  // PRIMARY: Real register dominant with meaningful deepening
  if (session?.latestRegister?.currentRegister === 'Real' && deepening > 0.3) {
    return true;
  }

  // SECONDARY: Somatic/visualization language as backup, but requires some deepening
  if (deepening > 0.2 && (containsSomaticLanguage(lastMessage || '') || containsVisualizationLanguage(lastMessage || ''))) {
    return true;
  }

  return false;
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
// Template selection (used for Tier 3, Tier 4, and Claude fallbacks)
// ============================================================================

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function selectTemplateMessage(callId: string, reEngagementCount: number): string {
  // Tier 3: structural escalation
  if (reEngagementCount === 3) return pickRandom(TEMPLATES.escalation_3);

  // Tier 4: final message
  if (reEngagementCount >= 4) {
    const session = getSessionState(callId);
    const isDeep = (
      (session?.latestMovement?.indicators?.deepening && session.latestMovement.indicators.deepening > 0.5) ||
      session?.latestRegister?.currentRegister === 'Real'
    );
    return pickRandom(isDeep ? TEMPLATES.final_deep : TEMPLATES.final_normal);
  }

  // Tier 1 & 2 fallback: context-based templates
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

  // Tier 2 escalation template fallback
  if (reEngagementCount === 2) return pickRandom(TEMPLATES.escalation_2);

  return pickRandom(TEMPLATES.default);
}

// ============================================================================
// Claude-based re-engagement generation (Tier 1 & 2)
// ============================================================================

/**
 * Build session context summary for Claude prompts
 */
function buildSessionContext(callId: string): string {
  const session = getSessionState(callId);
  if (!session) return 'No session state available.';

  const lines: string[] = [];

  // Latest guidance
  if (session.latestGuidance) {
    lines.push(`Last Posture: ${session.latestGuidance.posture}`);
    lines.push(`Last Strategic Direction: ${session.latestGuidance.strategicDirection}`);
    if (session.latestGuidance.urgency) lines.push(`Urgency: ${session.latestGuidance.urgency}`);
  }

  // Register
  if (session.latestRegister) {
    lines.push(`Current Register: ${session.latestRegister.currentRegister}`);
    lines.push(`Stuckness: ${session.latestRegister.stucknessScore.toFixed(2)}`);
  }

  // Movement
  if (session.latestMovement) {
    lines.push(`Movement Trajectory: ${session.latestMovement.trajectory}`);
    lines.push(`CSS Stage: ${session.latestMovement.cssStage}`);
    lines.push(`Session Position: ${session.latestMovement.sessionPosition}`);
    const indicators = session.latestMovement.indicators;
    const highIndicators = Object.entries(indicators)
      .filter(([_, v]) => v > 0.2)
      .map(([k, v]) => `${k}: ${(v as number).toFixed(2)}`);
    if (highIndicators.length > 0) {
      lines.push(`Active Indicators: ${highIndicators.join(', ')}`);
    }
  }

  // Patterns and connections
  if (session.patternsThisSession.length > 0) {
    lines.push(`Active Patterns: ${session.patternsThisSession.join('; ')}`);
  }
  if (session.connectionsThisSession.length > 0) {
    lines.push(`Symbolic Connections: ${session.connectionsThisSession.join('; ')}`);
  }

  lines.push(`Exchange Count: ${session.exchangeCount}`);

  return lines.join('\n');
}

/**
 * Format recent conversation history for Claude
 */
function formatRecentHistory(callId: string, count: number): string {
  const history = getConversationHistory(callId);
  const recent = history.slice(-count);
  if (recent.length === 0) return 'No conversation history available.';

  return recent.map(msg => {
    const role = msg.role === 'user' ? 'User' : 'Therapist';
    return `${role}: "${msg.content}"`;
  }).join('\n');
}

/**
 * Build a RAG query string from session state (lightweight version for silence context)
 */
function buildSilenceRagQuery(callId: string): string {
  const session = getSessionState(callId);
  const parts: string[] = ['silence re-engagement'];

  if (session?.latestRegister?.currentRegister) {
    parts.push(`register: ${session.latestRegister.currentRegister}`);
  }
  if (session?.latestMovement?.cssStage) {
    parts.push(`CSS stage: ${session.latestMovement.cssStage}`);
  }
  if (session?.latestMovement?.trajectory) {
    parts.push(`movement: ${session.latestMovement.trajectory}`);
  }
  if (session?.latestGuidance?.posture) {
    parts.push(`posture: ${session.latestGuidance.posture}`);
  }
  if (session?.patternsThisSession?.length) {
    parts.push(session.patternsThisSession[0]);
  }

  return parts.join(' | ');
}

/**
 * Tier 1: Full Claude + RAG re-engagement
 * Most therapeutically important — uses full sensing pipeline context
 */
async function generateTier1WithClaudeRAG(callId: string, silenceDurationSeconds: number): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('No ANTHROPIC_API_KEY configured');
  }

  const sessionContext = buildSessionContext(callId);
  const recentHistory = formatRecentHistory(callId, 8);

  // RAG: retrieve relevant therapeutic guidance
  let retrievedContext = '';
  try {
    const ragQuery = buildSilenceRagQuery(callId);
    const chunks = await queryKnowledgeBase(ragQuery, {
      limit: 3,
      threshold: 0.6
    });
    if (chunks.length > 0) {
      retrievedContext = buildRetrievedContext(chunks);
      console.log(`🔇 [SILENCE] RAG retrieved ${chunks.length} chunks for Tier 1`);
    }
  } catch (error) {
    console.warn('🔇 [SILENCE] RAG query failed for Tier 1, proceeding without:', error);
  }

  const prompt = `You are a master psychodynamic therapist. The user has been silent for ${silenceDurationSeconds} seconds after the following therapeutic exchange. Your task is to generate a single brief re-engagement response (1-2 sentences max) that will be spoken aloud by the voice agent.
${retrievedContext}
## Session Context
${sessionContext}

## Recent Conversation
${recentHistory}

## Instructions
Based on the full therapeutic context, generate a single brief re-engagement response that meets this specific moment. Do NOT be generic — connect to what is therapeutically alive right now.

- If the user appears to be in deep somatic or emotional processing, honor that depth.
- If confused, offer gentle scaffolding.
- If in Real register (body-based processing), keep it somatic and minimal.
- Do NOT ask multiple questions. One sentence or two short ones max.

CRITICAL — Do NOT use any of these phrases or close variants:
- "I'm right here." / "I'm here with you." / "I'm still with you."
- "Take your time." / "No rush." / "Take all the time you need."
- "Keep going." / "Say more." / "Tell me more."
- "I'm listening."
These phrases BREAK the user's internal processing by pulling attention to the therapist. They sound supportive but they interrupt the work. If you catch yourself generating any of these, rewrite entirely.

Respond with ONLY the re-engagement message. No quotes, no explanation, just the words the therapist should speak.`;

  const claudePromise = anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 150,
    messages: [{ role: 'user', content: prompt }]
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Tier 1 Claude timeout')), CLAUDE_TIMEOUT_MS);
  });

  const response = await Promise.race([claudePromise, timeoutPromise]);
  const content = response.content[0];
  if (content.type !== 'text' || !content.text.trim()) {
    throw new Error('Empty or non-text Claude response');
  }

  // Clean up: remove quotes if Claude wrapped the response
  return content.text.trim().replace(/^["']|["']$/g, '');
}

/**
 * Tier 2: Claude without RAG
 * Faster, still contextual — uses session state and recent history
 */
async function generateTier2WithClaude(callId: string, silenceDurationSeconds: number): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('No ANTHROPIC_API_KEY configured');
  }

  const session = getSessionState(callId);
  const recentHistory = formatRecentHistory(callId, 3);

  const prompt = `The user has been silent for ${silenceDurationSeconds} seconds. This is the second check-in. Based on this session context:
- Register: ${session?.latestRegister?.currentRegister || 'unknown'}
- Posture: ${session?.latestGuidance?.posture || 'unknown'}
- Movement: ${session?.latestMovement?.trajectory || 'unknown'}
- Deepening: ${session?.latestMovement?.indicators?.deepening?.toFixed(2) || '0'}
- CSS Stage: ${session?.latestMovement?.cssStage || 'unknown'}

Recent exchange:
${recentHistory}

Generate one brief sentence that gently re-engages without repeating the first check-in. This will be spoken aloud by a voice AI therapist.

CRITICAL — Do NOT use any of these phrases or close variants:
- "I'm right here." / "I'm here with you." / "I'm still with you."
- "Take your time." / "No rush." / "Take all the time you need."
- "Keep going." / "Say more." / "Tell me more."
- "I'm listening."
These break the user's internal processing. Rewrite entirely if you catch yourself generating any of these.

Respond with ONLY the re-engagement message. No quotes, no explanation.`;

  const claudePromise = anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }]
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Tier 2 Claude timeout')), CLAUDE_TIMEOUT_MS);
  });

  const response = await Promise.race([claudePromise, timeoutPromise]);
  const content = response.content[0];
  if (content.type !== 'text' || !content.text.trim()) {
    throw new Error('Empty or non-text Claude response');
  }

  return content.text.trim().replace(/^["']|["']$/g, '');
}

/**
 * Generate re-engagement message with tier-appropriate strategy
 * Tier 1: Full Claude + RAG (fallback: template)
 * Tier 2: Claude without RAG (fallback: template)
 * Tier 3-4: Templates only
 */
async function generateReEngagementMessage(
  callId: string,
  reEngagementCount: number,
  silenceDurationSeconds: number
): Promise<{ message: string; source: 'claude+rag' | 'claude' | 'template' }> {
  // Tier 1: Full Claude + RAG
  if (reEngagementCount === 1) {
    try {
      const message = await generateTier1WithClaudeRAG(callId, silenceDurationSeconds);
      console.log(`🔇 [SILENCE] Tier 1 generated via Claude+RAG`);
      return { message, source: 'claude+rag' };
    } catch (error: any) {
      const reason = error.message?.includes('timeout') ? 'timeout' : 'error';
      console.warn(`🔇 [SILENCE] Tier 1 Claude+RAG ${reason}, using template fallback:`, error.message);
      return { message: selectTemplateMessage(callId, reEngagementCount), source: 'template' };
    }
  }

  // Tier 2: Claude without RAG
  if (reEngagementCount === 2) {
    try {
      const message = await generateTier2WithClaude(callId, silenceDurationSeconds);
      console.log(`🔇 [SILENCE] Tier 2 generated via Claude (no RAG)`);
      return { message, source: 'claude' };
    } catch (error: any) {
      const reason = error.message?.includes('timeout') ? 'timeout' : 'error';
      console.warn(`🔇 [SILENCE] Tier 2 Claude ${reason}, using template fallback:`, error.message);
      return { message: selectTemplateMessage(callId, reEngagementCount), source: 'template' };
    }
  }

  // Tier 3 & 4: Templates only
  return { message: selectTemplateMessage(callId, reEngagementCount), source: 'template' };
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

  timer.timeout = setTimeout(() => handleSilenceTimeout(callId, timer.resetGeneration), adjustedThreshold);
}

// Maximum times to defer for sensing layer before firing anyway
const MAX_SENSING_DEFERRALS = 2;
// How long to wait for sensing layer to finish (5 seconds)
const SENSING_DEFERRAL_MS = 5000;

// Track deferral count per call to prevent infinite deferral loops
const sensingDeferralCounts = new Map<string, number>();

async function handleSilenceTimeout(callId: string, armedGeneration?: number): Promise<void> {
  const timer = silenceTimers.get(callId);
  if (!timer) return;

  const generation = armedGeneration ?? timer.resetGeneration;

  if (isStale(callId, generation)) {
    console.log(`🔇 [SILENCE] Aborting stale timeout for call ${callId} (user spoke, generation changed)`);
    return;
  }

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

  // COORDINATION: If sensing layer is mid-computation, defer instead of firing.
  // The sensing layer's real therapeutic guidance (posture, register, deepening)
  // is more clinically informed than the silence monitor's generic re-engagement.
  // Wait for it to finish so we can consult it.
  if (isSensingProcessing(callId)) {
    const deferrals = sensingDeferralCounts.get(callId) || 0;
    if (deferrals < MAX_SENSING_DEFERRALS) {
      sensingDeferralCounts.set(callId, deferrals + 1);
      console.log(`🔇 [SILENCE] Sensing layer is processing for call ${callId} — deferring (${deferrals + 1}/${MAX_SENSING_DEFERRALS})`);
      // Re-check after a short delay instead of firing now
      timer.timeout = setTimeout(() => handleSilenceTimeout(callId, generation), SENSING_DEFERRAL_MS);
      return;
    }
    console.log(`🔇 [SILENCE] Max deferrals reached for call ${callId}, proceeding with re-engagement`);
  }
  // Reset deferral count since we're proceeding
  sensingDeferralCounts.delete(callId);

  if (isStale(callId, generation)) {
    console.log(`🔇 [SILENCE] Aborting stale timeout for call ${callId} after deferral check (user spoke)`);
    return;
  }

  // MOD 2: Deepening override — check if user is going deeper during silence
  // Now this reads the LATEST session state, which includes any guidance
  // the sensing layer just finished computing (thanks to the deferral above).
  const session = getSessionState(callId);
  const currentDeepening = session?.latestMovement?.indicators?.deepening ?? 0;

  if (timer.lastDeepening >= 0 && currentDeepening > timer.lastDeepening + 0.1) {
    console.log(`🔇 [SILENCE] Deepening override for call ${callId}: ${timer.lastDeepening.toFixed(2)} → ${currentDeepening.toFixed(2)} — resetting to Tier 1`);
    timer.reEngagementCount = 0;
  }

  // CONSULTATION: If the sensing layer's latest guidance says "hold" or "silent",
  // honor that posture — extend the threshold and don't fire yet.
  const latestPosture = session?.latestGuidance?.posture;
  if (latestPosture === 'hold' || latestPosture === 'silent' || latestPosture === 'wait_and_track') {
    // The sensing layer explicitly said to be quiet. Only proceed if this is
    // already escalation tier 2+ (the user has been silent a LONG time).
    if (timer.reEngagementCount < 1) {
      console.log(`🔇 [SILENCE] Sensing layer posture is "${latestPosture}" for call ${callId} — honoring therapeutic hold, re-arming with extended threshold`);
      // Re-arm with an extra 15 seconds of space
      timer.timeout = setTimeout(() => handleSilenceTimeout(callId, generation), 15_000);
      return;
    }
  }

  timer.reEngagementCount++;
  console.log(`🔇 [SILENCE] Firing re-engagement #${timer.reEngagementCount} for call ${callId}`);

  // Calculate silence duration for Claude prompts
  const silenceDurationMs = callState.lastUserUtteranceAt
    ? Date.now() - callState.lastUserUtteranceAt.getTime()
    : 0;
  const silenceDurationSeconds = Math.round(silenceDurationMs / 1000);

  // Generate message using tier-appropriate strategy
  // NOTE: generateReEngagementMessage already reads session state (posture,
  // register, deepening) via buildSessionContext — so the sensing layer's
  // completed guidance naturally informs the re-engagement message content.
  const { message, source } = await generateReEngagementMessage(callId, timer.reEngagementCount, silenceDurationSeconds);

  if (isStale(callId, generation)) {
    console.log(`🔇 [SILENCE] Aborting stale re-engagement #${timer.reEngagementCount} for call ${callId} — user spoke during Claude generation (source: ${source})`);
    return;
  }

  // Use Vapi's "say" command to force the agent to speak the re-engagement.
  // This bypasses the LLM entirely — the agent speaks the exact text.
  // Regular guidance uses add-message (silent context); re-engagement uses say (forced speech).
  const injected = await injectSpokenReEngagement(callId, message);

  if (isStale(callId, generation)) {
    console.log(`🔇 [SILENCE] User spoke during injection for call ${callId} — will not re-arm`);
    return;
  }

  if (injected) {
    console.log(`🔇 [SILENCE] Re-engagement #${timer.reEngagementCount} injected for call ${callId} [${source}]: "${message}"`);
  } else {
    console.warn(`🔇 [SILENCE] Failed to inject re-engagement for call ${callId}`);
  }

  // MOD 2: Store current deepening for next comparison
  timer.lastDeepening = currentDeepening;

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
    monitorStartedAt: Date.now(),
    lastDeepening: -1,
    resetGeneration: 0
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

  // Reset re-engagement count and deepening baseline on any new user speech
  timer.reEngagementCount = 0;
  timer.lastDeepening = -1;

  timer.resetGeneration++;
  console.log(`🔇 [SILENCE] Generation incremented to ${timer.resetGeneration} for call ${callId}`);

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
    sensingDeferralCounts.delete(callId);
    console.log(`🔇 [SILENCE] Stopped monitoring for call ${callId}`);
  }
}

/**
 * Get count of active silence monitors (for debugging)
 */
export function getActiveSilenceMonitorCount(): number {
  return silenceTimers.size;
}
