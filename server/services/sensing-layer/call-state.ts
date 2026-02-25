// server/services/sensing-layer/call-state.ts
// In-memory store for VAPI call control URLs and session state

interface CallState {
  controlUrl: string;
  userId: string;
  sessionId: string;
  exchangeCount: number;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  lastUserUtteranceAt: Date | null;
  lastAgentUtteranceAt: Date | null;
  isAgentCurrentlySpeaking: boolean;
  sensingLayerProcessing: boolean;
  sensingLayerLastCompletedAt: number | null;
  status: 'active' | 'ended';
  lastEventAt: number;
  createdAt: Date;
}

// In-memory store for call states
const callStates = new Map<string, CallState>();

/**
 * Track a VAPI webhook event - updates call status and controlUrl
 * Call this at the top of every webhook event before any processing
 */
export function trackVapiCall(event: any): { callId: string | null; status: string; hasControlUrl: boolean } {
  const callId = event?.call?.id || event?.callId || event?.id || null;
  const controlUrl = event?.call?.monitor?.controlUrl || event?.monitor?.controlUrl;
  const type = event?.type || event?.event || event?.message?.type;

  if (!callId) {
    return { callId: null, status: 'unknown', hasControlUrl: false };
  }

  const existing = callStates.get(callId);
  const isEnding = type && String(type).includes('end');

  if (existing) {
    existing.lastEventAt = Date.now();
    if (isEnding) existing.status = 'ended';
    if (controlUrl) existing.controlUrl = controlUrl;
  } else {
    callStates.set(callId, {
      controlUrl: controlUrl || '',
      userId: '',
      sessionId: callId,
      exchangeCount: 0,
      conversationHistory: [],
      lastUserUtteranceAt: null,
      lastAgentUtteranceAt: null,
      isAgentCurrentlySpeaking: false,
      sensingLayerProcessing: false,
      sensingLayerLastCompletedAt: null,
      status: isEnding ? 'ended' : 'active',
      lastEventAt: Date.now(),
      createdAt: new Date()
    });
  }

  const state = callStates.get(callId)!;
  console.log('📞 [CALL TRACK]', { type, callId, status: state.status, hasControlUrl: Boolean(state.controlUrl) });

  return { callId, status: state.status, hasControlUrl: Boolean(state.controlUrl) };
}

/**
 * Check if a call is still active
 */
export function isCallActive(callId: string): boolean {
  const state = callStates.get(callId);
  return state?.status === 'active';
}

// Cleanup interval - remove stale entries after 2 hours
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/**
 * Store the control URL for a call
 */
export function setControlUrl(callId: string, url: string, userId?: string): void {
  const existing = callStates.get(callId);

  if (existing) {
    existing.controlUrl = url;
    if (userId) existing.userId = userId;
  } else {
    callStates.set(callId, {
      controlUrl: url,
      userId: userId || '',
      sessionId: callId,
      exchangeCount: 0,
      conversationHistory: [],
      lastUserUtteranceAt: null,
      lastAgentUtteranceAt: null,
      isAgentCurrentlySpeaking: false,
      sensingLayerProcessing: false,
      sensingLayerLastCompletedAt: null,
      status: 'active',
      lastEventAt: Date.now(),
      createdAt: new Date()
    });
  }

  console.log(`📡 [CallState] Stored controlUrl for call ${callId}`);
}

/**
 * Get the control URL for a call
 */
export function getControlUrl(callId: string): string | undefined {
  return callStates.get(callId)?.controlUrl;
}

/**
 * Get full call state
 */
export function getCallState(callId: string): CallState | undefined {
  return callStates.get(callId);
}

/**
 * Update call state with new information
 */
export function updateCallState(
  callId: string,
  updates: Partial<Omit<CallState, 'createdAt'>>
): void {
  const existing = callStates.get(callId);

  if (existing) {
    Object.assign(existing, updates);
  } else {
    // Create new state if doesn't exist
    callStates.set(callId, {
      controlUrl: updates.controlUrl || '',
      userId: updates.userId || '',
      sessionId: updates.sessionId || callId,
      exchangeCount: updates.exchangeCount || 0,
      conversationHistory: updates.conversationHistory || [],
      lastUserUtteranceAt: null,
      lastAgentUtteranceAt: null,
      isAgentCurrentlySpeaking: false,
      sensingLayerProcessing: false,
      sensingLayerLastCompletedAt: null,
      status: 'active',
      lastEventAt: Date.now(),
      createdAt: new Date()
    });
  }
}

/**
 * Add a message to conversation history
 */
export function addToConversationHistory(
  callId: string,
  role: 'user' | 'assistant',
  content: string
): void {
  const state = callStates.get(callId);

  if (state) {
    const now = new Date();
    state.conversationHistory.push({
      role,
      content,
      timestamp: now
    });

    // Update role-specific timestamps
    if (role === 'user') {
      state.lastUserUtteranceAt = now;
      state.exchangeCount++;
    } else if (role === 'assistant') {
      state.lastAgentUtteranceAt = now;
    }

    // Keep only last 50 messages to prevent memory bloat
    if (state.conversationHistory.length > 50) {
      state.conversationHistory = state.conversationHistory.slice(-50);
    }
  }
}

/**
 * Get conversation history for a call
 */
export function getConversationHistory(callId: string): CallState['conversationHistory'] {
  return callStates.get(callId)?.conversationHistory || [];
}

/**
 * Get exchange count for a call
 */
export function getExchangeCount(callId: string): number {
  return callStates.get(callId)?.exchangeCount || 0;
}

/**
 * Clear the control URL and state for a call
 */
export function clearControlUrl(callId: string): void {
  callStates.delete(callId);
  console.log(`🧹 [CallState] Cleared state for call ${callId}`);
}

/**
 * Clean up stale call states (called periodically)
 */
export function cleanupStaleStates(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [callId, state] of Array.from(callStates.entries())) {
    if (now - state.createdAt.getTime() > STALE_THRESHOLD_MS) {
      callStates.delete(callId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 [CallState] Cleaned up ${cleaned} stale call states`);
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupStaleStates, 30 * 60 * 1000);

/**
 * Get the content of the last user message for a call
 */
export function getLastUserMessage(callId: string): string | undefined {
  const history = callStates.get(callId)?.conversationHistory;
  if (!history) return undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content;
  }
  return undefined;
}

/**
 * Set the agent's current speaking state for a call
 */
export function setAgentSpeakingState(callId: string, isSpeaking: boolean): void {
  const state = callStates.get(callId);
  if (state) {
    state.isAgentCurrentlySpeaking = isSpeaking;
  }
}

/**
 * Get the agent's current speaking state for a call
 */
export function getAgentSpeakingState(callId: string): boolean {
  return callStates.get(callId)?.isAgentCurrentlySpeaking ?? false;
}

/**
 * Get stats about current call states (for debugging)
 */
export function getCallStateStats(): { activeCount: number; totalHistory: number } {
  let totalHistory = 0;
  for (const state of Array.from(callStates.values())) {
    totalHistory += state.conversationHistory.length;
  }

  return {
    activeCount: callStates.size,
    totalHistory
  };
}

/**
 * Set the sensing layer processing state for a call.
 * Called when processSensingLayerAsync starts and completes.
 */
export function setSensingProcessing(callId: string, isProcessing: boolean): void {
  const state = callStates.get(callId);
  if (state) {
    state.sensingLayerProcessing = isProcessing;
    if (!isProcessing) {
      state.sensingLayerLastCompletedAt = Date.now();
    }
  }
}

/**
 * Check if the sensing layer is currently processing for a call.
 */
export function isSensingProcessing(callId: string): boolean {
  return callStates.get(callId)?.sensingLayerProcessing ?? false;
}
