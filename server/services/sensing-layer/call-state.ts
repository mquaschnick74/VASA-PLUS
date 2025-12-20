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
  createdAt: Date;
}

// In-memory store for call states
const callStates = new Map<string, CallState>();

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
    state.conversationHistory.push({
      role,
      content,
      timestamp: new Date()
    });

    // Increment exchange count for user messages
    if (role === 'user') {
      state.exchangeCount++;
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
