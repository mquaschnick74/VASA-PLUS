// session-phase-service.ts - Track conversation phases

interface SessionPhase {
  userId: string;
  callId: string;
  exchangeCount: number;
  currentPhase: 'narrative' | 'emergence' | 'integration';
  narrativeThemes: string[];
  readyForCSS: boolean;
  lastUpdated: Date;
}

const sessionPhases = new Map<string, SessionPhase>();

export function updateSessionPhase(
  callId: string,
  userId: string
): SessionPhase {
  const existing = sessionPhases.get(callId);

  if (existing) {
    existing.exchangeCount++;

    // Phase transitions
    if (existing.exchangeCount >= 40 && existing.currentPhase !== 'integration') {
      existing.currentPhase = 'integration';
      existing.readyForCSS = true;
      console.log(`📈 Session ${callId} ready for CSS work after ${existing.exchangeCount} exchanges`);
    } else if (existing.exchangeCount >= 26 && existing.currentPhase === 'narrative') {
      existing.currentPhase = 'emergence';
      console.log(`📊 Session ${callId} entering pattern emergence phase`);
    }

    existing.lastUpdated = new Date();
    return existing;
  }

  // New session
  const newPhase: SessionPhase = {
    userId,
    callId,
    exchangeCount: 1,
    currentPhase: 'narrative',
    narrativeThemes: [],
    readyForCSS: false,
    lastUpdated: new Date()
  };

  sessionPhases.set(callId, newPhase);
  console.log(`🎭 New session ${callId} starting narrative phase`);
  return newPhase;
}

export function getSessionPhase(callId: string): SessionPhase | null {
  return sessionPhases.get(callId) || null;
}

export function isReadyForCSS(callId: string): boolean {
  const phase = sessionPhases.get(callId);
  return phase?.readyForCSS || false;
}