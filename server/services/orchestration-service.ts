// Enhanced Orchestration Service - CSS tracking with agent orchestration
import { detectCSSPatterns, assessPatternConfidence } from './css-pattern-service';
import { supabase } from './supabase-service';
import { storeSessionContext } from './memory-service';
import { parseAssistantOutput, extractCSSStage, needsSafetyIntervention, extractRegister } from '../utils/parseAssistantOutput';

interface SessionState {
  userId: string;
  callId: string;
  agentName: string;
  currentCSSStage: string;
  sessionStartTime: Date;
  processedTranscripts: Set<string>; // Track processed transcript hashes
}

// Enhanced session state with orchestration
interface EnhancedSessionState extends SessionState {
  agentSwitches: Array<{
    timestamp: Date;
    fromAgent: string;
    toAgent: string;
    reason: string;
  }>;
  suggestedAgent: string | null;
  lastSuggestionTime: Date | null;
}

// Two-tier cache system with enhanced state
const activeSessions = new Map<string, EnhancedSessionState>();
const checkedSessions = new Set<string>(); // Track which sessions we've already checked in DB
const initializationLocks = new Map<string, Promise<EnhancedSessionState | null>>(); // Prevent race conditions

// Cleanup stale sessions every 30 minutes
setInterval(() => {
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  const staleCallIds: string[] = [];
  
  activeSessions.forEach((session, callId) => {
    if (session.sessionStartTime.getTime() < twoHoursAgo) {
      staleCallIds.push(callId);
    }
  });
  
  staleCallIds.forEach(callId => {
    console.log(`🧹 Cleaning up stale session: ${callId}`);
    activeSessions.delete(callId);
    checkedSessions.delete(callId);
  });
}, 30 * 60 * 1000);

/**
 * Ensures a session exists, initializing if necessary
 * Handles server restarts and missing call-started events efficiently
 */
export async function ensureSession(
  callId: string,
  userId?: string,
  agentName?: string
): Promise<EnhancedSessionState | null> {
  // Fast path: already active
  if (activeSessions.has(callId)) {
    return activeSessions.get(callId)!;
  }
  
  // If initialization is already in progress, wait for it
  if (initializationLocks.has(callId)) {
    return await initializationLocks.get(callId)!;
  }
  
  // Start initialization with lock
  const initPromise = ensureSessionInternal(callId, userId, agentName);
  initializationLocks.set(callId, initPromise);
  
  try {
    const result = await initPromise;
    return result;
  } finally {
    initializationLocks.delete(callId);
  }
}

async function ensureSessionInternal(
  callId: string,
  userId?: string,
  agentName?: string
): Promise<EnhancedSessionState | null> {
  // Avoid repeated DB checks for non-existent sessions
  if (checkedSessions.has(callId)) {
    console.log(`⚠️ Session ${callId} already checked, not found in DB`);
    return null;
  }
  
  // Mark as checked
  checkedSessions.add(callId);
  
  // Check database once
  const { data: existing } = await supabase
    .from('therapeutic_sessions')
    .select('user_id, agent_name, start_time')
    .eq('call_id', callId)
    .single();
  
  if (existing) {
    console.log(`♻️ Restored session from DB: ${callId}`);
    // Restore to active sessions with enhanced state
    const session: EnhancedSessionState = {
      userId: existing.user_id,
      callId,
      agentName: existing.agent_name,
      currentCSSStage: 'pointed_origin',
      sessionStartTime: new Date(existing.start_time),
      processedTranscripts: new Set(),
      agentSwitches: [],
      suggestedAgent: null,
      lastSuggestionTime: null
    };
    activeSessions.set(callId, session);
    return session;
  }
  
  // Need userId to create new session
  if (!userId) {
    console.warn(`❌ Cannot create session ${callId}: no userId provided`);
    return null;
  }
  
  // Initialize new session
  console.log(`🆕 Creating new session: ${callId}`);
  return await initializeSession(userId, callId, agentName || 'sarah');
}

export async function initializeSession(
  userId: string,
  callId: string,
  agentName: string
): Promise<EnhancedSessionState> {
  const session: EnhancedSessionState = {
    userId,
    callId,
    agentName,
    currentCSSStage: 'pointed_origin',
    sessionStartTime: new Date(),
    processedTranscripts: new Set(),
    agentSwitches: [],
    suggestedAgent: null,
    lastSuggestionTime: null
  };

  activeSessions.set(callId, session);
  checkedSessions.add(callId); // Mark as checked/exists

  await supabase
    .from('therapeutic_sessions')
    .upsert({
      call_id: callId,
      user_id: userId,
      agent_name: agentName,
      status: 'active',
      start_time: new Date().toISOString()
    }, {
      onConflict: 'call_id'
    });

  console.log(`✅ Enhanced session initialized: ${callId} for user ${userId} with ${agentName}`);
  return session;
}

export async function processTranscript(
  callId: string,
  transcript: string,
  role: string,
  userId?: string,
  agentName?: string
): Promise<void> {
  // Try to ensure session exists (defensive programming)
  let session = activeSessions.get(callId);
  
  if (!session && userId) {
    console.log(`🔧 Auto-initializing session from processTranscript for ${callId}`);
    const ensuredSession = await ensureSession(callId, userId, agentName);
    session = ensuredSession || undefined;
  }
  
  if (!session) {
    console.log(`⚠️ Cannot process transcript: no session for ${callId}`);
    return;
  }
  
  // Handle assistant messages with new speak/meta parsing
  if (role === 'assistant') {
    const parsed = parseAssistantOutput(transcript);
    
    // Extract CSS stage from metadata if available
    const metaStage = extractCSSStage(parsed.meta);
    if (metaStage && metaStage !== 'NONE') {
      session.currentCSSStage = metaStage.toLowerCase();
      console.log(`📊 Assistant meta CSS stage: ${metaStage}`);
    }
    
    // Store metadata in database if present
    if (parsed.meta) {
      await supabase
        .from('css_patterns')
        .insert({
          call_id: callId,
          stage: parsed.meta.css?.stage || 'NONE',
          register: parsed.meta.register || 'undetermined',
          confidence: parsed.meta.css?.confidence || 0,
          safety_flag: parsed.meta.safety?.flag || false,
          crisis_flag: parsed.meta.safety?.crisis || false,
          hsfb_invoked: parsed.meta.hsfb?.invoked || false,
          detected_at: new Date().toISOString()
        });
        
      // Check for safety interventions
      if (needsSafetyIntervention(parsed.meta)) {
        console.log(`🚨 Safety intervention triggered: ${parsed.meta.safety?.reason}`);
        // TODO: Trigger safety protocol workflow
      }
    }
    
    // Don't store assistant transcripts individually
    return;
  }
  
  // Process user transcripts as before
  if (role !== 'user') {
    return;
  }

  // Check if we've already processed this exact transcript
  const transcriptHash = Buffer.from(transcript).toString('base64').substring(0, 50);
  if (session.processedTranscripts.has(transcriptHash)) {
    console.log(`⏭️ Skipping duplicate transcript for ${callId}`);
    return;
  }
  session.processedTranscripts.add(transcriptHash);

  // Don't store individual transcripts - only detect patterns
  // Full transcript will be stored at end-of-call
  
  // Always detect CSS patterns regardless of emotional state
  const patterns = detectCSSPatterns(transcript, false);

  if (patterns.currentStage !== session.currentCSSStage) {
    console.log(`🎯 CSS Stage progression: ${session.currentCSSStage} → ${patterns.currentStage}`);
    
    const previousStage = session.currentCSSStage;
    session.currentCSSStage = patterns.currentStage;

    await supabase
      .from('css_progressions')
      .insert({
        user_id: session.userId,
        call_id: callId,
        from_stage: previousStage,
        to_stage: patterns.currentStage,
        trigger_content: transcript.substring(0, 200),
        agent_name: session.agentName
      });
  }

  await storeCSSPatterns(session, patterns);
  
  // Add orchestration analysis
  await analyzeForOrchestration(session, transcript);
}

// Local agent suggestion analyzer
function analyzeForAgentSuggestion(transcript: string, currentAgent: string): {
  suggestedAgent: string | null;
  reason: string | null;
  confidence: number;
} {
  const text = transcript.toLowerCase();
  
  // Look for contradiction patterns (suggest Sarah)
  const contradictionPatterns = [
    /part of me.*but.*part/,
    /i want.*but.*i (also|really)/,
    /i love.*but.*i/,
    /i need.*and.*i need/,
    /torn between/,
    /on one hand.*on the other/
  ];
  
  if (contradictionPatterns.some(pattern => pattern.test(text)) && currentAgent !== 'sarah') {
    return {
      suggestedAgent: 'sarah',
      reason: 'contradiction_detected',
      confidence: 0.8
    };
  }

  // Look for behavior gap patterns (suggest Mathew)
  const behaviorGapPatterns = [
    /i want to.*but i.*don['']?t/,
    /i should.*but i/,
    /i keep.*even though/,
    /i know.*but i still/,
    /say.*do/,
    /intention.*action/
  ];
  
  if (behaviorGapPatterns.some(pattern => pattern.test(text)) && currentAgent !== 'mathew') {
    return {
      suggestedAgent: 'mathew',
      reason: 'behavior_gap_detected', 
      confidence: 0.8
    };
  }

  // Look for integration/shift patterns (suggest Marcus)
  const integrationPatterns = [
    /something.*shift/,
    /i see.*differently/,
    /both.*can be true/,
    /i notice.*noticing/,
    /perspective.*changed/,
    /integration/,
    /meta.*awareness/
  ];
  
  if (integrationPatterns.some(pattern => pattern.test(text)) && currentAgent !== 'marcus') {
    return {
      suggestedAgent: 'marcus',
      reason: 'integration_detected',
      confidence: 0.8
    };
  }

  return {
    suggestedAgent: null,
    reason: null,
    confidence: 0
  };
}

// Orchestration analysis function
async function analyzeForOrchestration(
  session: EnhancedSessionState, 
  transcript: string
): Promise<void> {
  // Don't spam suggestions - wait at least 2 minutes between suggestions
  const now = new Date();
  if (session.lastSuggestionTime && 
      (now.getTime() - session.lastSuggestionTime.getTime()) < 120000) {
    return;
  }

  // Analyze transcript for agent suggestions
  const suggestion = analyzeForAgentSuggestion(transcript, session.agentName);
  
  if (suggestion.suggestedAgent && suggestion.confidence > 0.7) {
    console.log(`🔄 Agent suggestion: ${session.agentName} → ${suggestion.suggestedAgent} (${suggestion.reason})`);
    
    // Update session state
    session.suggestedAgent = suggestion.suggestedAgent;
    session.lastSuggestionTime = now;
    
    // Store suggestion in database for tracking
    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: session.userId,
        call_id: session.callId,
        context_type: 'agent_suggestion',
        content: `Agent routing suggestion: ${session.agentName} → ${suggestion.suggestedAgent} for ${suggestion.reason}`,
        confidence: suggestion.confidence,
        importance: 6
      });
  }
}

// Execute agent switch
export async function executeAgentSwitch(
  callId: string,
  newAgent: string,
  reason: string = 'manual_switch'
): Promise<boolean> {
  const session = activeSessions.get(callId);
  if (!session) {
    console.warn(`Cannot switch agent: session ${callId} not found`);
    return false;
  }

  const previousAgent = session.agentName;
  
  // Update session state
  session.agentName = newAgent;
  session.agentSwitches.push({
    timestamp: new Date(),
    fromAgent: previousAgent,
    toAgent: newAgent,
    reason
  });
  session.suggestedAgent = null; // Clear suggestion
  
  // Update database
  await supabase
    .from('therapeutic_sessions')
    .update({
      agent_name: newAgent,
      metadata: {
        agentSwitches: session.agentSwitches
      }
    })
    .eq('call_id', callId);

  // Store switch in therapeutic context
  await supabase
    .from('therapeutic_context')
    .insert({
      user_id: session.userId,
      call_id: callId,
      context_type: 'agent_switch',
      content: `Agent switch: ${previousAgent} → ${newAgent} (${reason})`,
      confidence: 1.0,
      importance: 7
    });

  console.log(`✅ Agent switch executed: ${previousAgent} → ${newAgent} (${reason})`);
  return true;
}

// Get current orchestration state
export function getOrchestrationState(callId: string): {
  currentAgent: string;
  suggestedAgent: string | null;
  agentSwitches: Array<{timestamp: Date; fromAgent: string; toAgent: string; reason: string}>;
  canSwitch: boolean;
  currentCSSStage: string;
  sessionStartTime: Date;
  userId: string;
} | null {
  const session = activeSessions.get(callId);
  if (!session) return null;

  return {
    currentAgent: session.agentName,
    suggestedAgent: session.suggestedAgent,
    agentSwitches: session.agentSwitches,
    canSwitch: !session.lastSuggestionTime || 
                (Date.now() - session.lastSuggestionTime.getTime()) > 60000, // 1 minute cooldown
    currentCSSStage: session.currentCSSStage,
    sessionStartTime: session.sessionStartTime,
    userId: session.userId
  };
}

export async function processEndOfCall(
  callId: string,
  fullTranscript?: string,
  summary?: string,
  callMetadata?: any
): Promise<void> {
  let session = activeSessions.get(callId);

  if (!session) {
    const { data: dbSession } = await supabase
      .from('therapeutic_sessions')
      .select('user_id, agent_name')
      .eq('call_id', callId)
      .single();

    if (!dbSession) {
      const userId = callMetadata?.metadata?.userId;
      const agentName = callMetadata?.metadata?.agentName || 'Sarah';

      if (!userId) return;

      let duration = callMetadata?.duration || 60;

      await supabase
        .from('therapeutic_sessions')
        .insert({
          call_id: callId,
          user_id: userId,
          agent_name: agentName,
          status: 'completed',
          start_time: new Date(Date.now() - (duration * 1000)).toISOString(),
          end_time: new Date().toISOString(),
          duration_seconds: duration,
          metadata: callMetadata
        });

      session = {
        userId,
        callId,
        agentName,
        currentCSSStage: 'pointed_origin',
        sessionStartTime: new Date(Date.now() - (duration * 1000)),
        processedTranscripts: new Set(),
        agentSwitches: [],
        suggestedAgent: null,
        lastSuggestionTime: null
      };
    } else {
      session = {
        userId: dbSession.user_id,
        callId,
        agentName: dbSession.agent_name,
        currentCSSStage: 'pointed_origin',
        sessionStartTime: new Date(),
        processedTranscripts: new Set(),
        agentSwitches: [],
        suggestedAgent: null,
        lastSuggestionTime: null
      };
    }
  }

  const duration = Math.floor((Date.now() - session.sessionStartTime.getTime()) / 1000);

  await supabase
    .from('therapeutic_sessions')
    .update({
      status: 'completed',
      end_time: new Date().toISOString(),
      duration_seconds: duration,
      metadata: callMetadata
    })
    .eq('call_id', callId);

  if (fullTranscript) {
    await processFullTranscript(session, fullTranscript);
  }

  if (summary) {
    await storeSessionContext(session.userId, callId, summary, 'call_summary');
  }

  // Cleanup from both caches
  activeSessions.delete(callId);
  checkedSessions.delete(callId);
  console.log(`✅ Session completed and cleaned up: ${callId}`);
}

async function processFullTranscript(session: EnhancedSessionState, transcript: string): Promise<void> {
  const patterns = detectCSSPatterns(transcript, true);
  const { confidence, reasoning } = assessPatternConfidence(patterns);

  console.log(`📊 Full transcript analysis:`);
  console.log(`  CSS Stage: ${patterns.currentStage}`);
  console.log(`  Patterns: CVDC=${patterns.cvdcPatterns.length}, IBM=${patterns.ibmPatterns.length}`);

  // Store the complete transcript (this is the only transcript we store)
  await supabase
    .from('session_transcripts')
    .insert({
      user_id: session.userId,
      call_id: session.callId,
      text: transcript,
      role: 'complete'
    });

  await storeCSSPatterns(session, patterns);

  await supabase
    .from('css_patterns')
    .insert({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'STAGE_ASSESSMENT',
      content: `Stage: ${patterns.currentStage}. ${reasoning}`,
      css_stage: patterns.currentStage,
      confidence: confidence,
      detected_at: new Date().toISOString()
    });
}

async function storeCSSPatterns(session: EnhancedSessionState, patterns: any): Promise<void> {
  const patternInserts = [];

  for (const cvdc of patterns.cvdcPatterns) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'CVDC',
      content: cvdc,
      extracted_contradiction: cvdc.includes('but') 
        ? cvdc.split('but').map((s: string) => s.trim()).join(' BUT ')
        : cvdc,
      css_stage: patterns.currentStage,
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  for (const ibm of patterns.ibmPatterns) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'IBM',
      content: ibm,
      behavioral_gap: ibm,
      css_stage: patterns.currentStage,
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  for (const thend of patterns.thendIndicators) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'Thend',
      content: thend,
      css_stage: patterns.currentStage,
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  for (const cyvc of patterns.cyvcPatterns) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'CYVC',
      content: cyvc,
      css_stage: patterns.currentStage,
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  if (patternInserts.length > 0) {
    await supabase.from('css_patterns').insert(patternInserts);
    console.log(`💾 Stored ${patternInserts.length} CSS patterns`);
  }
}