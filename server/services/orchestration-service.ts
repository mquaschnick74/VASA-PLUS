// Simplified Orchestration Service - CSS tracking only
import { detectCSSPatterns, assessPatternConfidence } from './css-pattern-service';
import { supabase } from './supabase-service';
import { storeSessionContext } from './memory-service';
import { parseAssistantOutput, extractCSSStage, needsSafetyIntervention, extractRegister } from '../utils/parseAssistantOutput';
import { generateEnhancedSessionSummary } from './summary-service'; // ADD THIS IMPORT

interface SessionState {
  userId: string;
  callId: string;
  agentName: string;
  currentCSSStage: string;
  sessionStartTime: Date;
  processedTranscripts: Set<string>; // Track processed transcript hashes
  exchangeCount: number; // Track number of exchanges
  narrativePhase: 'narrative_collection' | 'css_entry_assessment' | 'css_active'; // Track narrative phase
}

// Two-tier cache system
const activeSessions = new Map<string, SessionState>();
const checkedSessions = new Set<string>(); // Track which sessions we've already checked in DB
const initializationLocks = new Map<string, Promise<SessionState | null>>(); // Prevent race conditions

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
): Promise<SessionState | null> {
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
): Promise<SessionState | null> {
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
    // Restore to active sessions
    const session: SessionState = {
      userId: existing.user_id,
      callId,
      agentName: existing.agent_name,
      currentCSSStage: 'pointed_origin',
      sessionStartTime: new Date(existing.start_time),
      processedTranscripts: new Set(),
      exchangeCount: 0,
      narrativePhase: 'narrative_collection'
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
  return await initializeSession(userId, callId, agentName || 'Unknown');
}

export async function initializeSession(
  userId: string,
  callId: string,
  agentName: string
): Promise<SessionState> {
  const session: SessionState = {
    userId,
    callId,
    agentName,
    currentCSSStage: 'pointed_origin',
    sessionStartTime: new Date(),
    processedTranscripts: new Set(),
    exchangeCount: 0,
    narrativePhase: 'narrative_collection'
  };

  activeSessions.set(callId, session);
  checkedSessions.add(callId);

  try {
    // ENHANCED LOGGING: Log what we're about to insert
    console.log(`🔄 Attempting to save session to database:`, {
      call_id: callId,
      user_id: userId,
      agent_name: agentName,
      status: 'active'
    });

    const { data, error } = await supabase
      .from('therapeutic_sessions')
      .upsert({
        call_id: callId,
        user_id: userId,
        agent_name: agentName,
        status: 'active',
        start_time: new Date().toISOString()
      }, {
        onConflict: 'call_id'
      })
      .select();

    if (error) {
      console.error(`❌ Failed to save session to database:`, error);
      console.error(`   Error code: ${error.code}`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Full details: ${JSON.stringify(error, null, 2)}`);
      // Don't throw - keep session in memory even if DB fails
    } else {
      console.log(`✅ Session saved to database successfully!`);
      console.log(`   Session ID: ${data?.[0]?.id}`);
      console.log(`   Call ID: ${data?.[0]?.call_id}`);
    }
  } catch (dbError) {
    console.error(`❌ Database operation failed with exception:`, dbError);
    console.error(`   Exception type: ${dbError instanceof Error ? dbError.constructor.name : typeof dbError}`);
    console.error(`   Exception message: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    // Continue with in-memory session even if DB fails
  }

  console.log(`✅ Session initialized: ${callId} for user ${userId}`);
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

    // Update narrative phase if present in metadata
    if (parsed.meta && 'phase' in parsed.meta) {
      session.narrativePhase = (parsed.meta as any).phase;
      console.log(`📖 Narrative phase: ${(parsed.meta as any).phase}`);
    }

    // Update exchange count if present
    if (parsed.meta && 'exchange_count' in parsed.meta) {
      session.exchangeCount = (parsed.meta as any).exchange_count;
    }

    // Store metadata in database if present
    if (parsed.meta && parsed.meta.css?.stage && parsed.meta.css.stage !== 'NONE') {
      await supabase
        .from('css_patterns')
        .insert({
          call_id: callId,
          user_id: session.userId,
          pattern_type: 'META',
          content: JSON.stringify(parsed.meta),
          css_stage: parsed.meta.css?.stage || 'NONE',
          confidence: parsed.meta.css?.confidence || 0,
          safety_flag: parsed.meta.safety?.flag || false,
          crisis_flag: (parsed.meta.safety as any)?.crisis || false,
          detected_at: new Date().toISOString()
        });

      // Check for safety interventions
      if (needsSafetyIntervention(parsed.meta)) {
        // Check for safety interventions
        if (needsSafetyIntervention(parsed.meta)) {
          console.log(`🚨 Safety intervention triggered: ${(parsed.meta.safety as any)?.reason || 'Safety flag detected'}`);
          // TODO: Trigger safety protocol workflow
        }
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

  // Increment exchange count for user messages
  session.exchangeCount++;

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
  // Always detect CSS patterns regardless of emotional state
  const patterns = detectCSSPatterns(transcript, false);

  if (patterns.currentStage !== session.currentCSSStage) {
    console.log(`🎯 CSS Stage progression: ${session.currentCSSStage} → ${patterns.currentStage}`);

    const previousStage = session.currentCSSStage;
    session.currentCSSStage = patterns.currentStage;

    // Record the progression in css_progressions table
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
      // Try multiple paths to extract userId
      const userId = callMetadata?.metadata?.userId || 
                     callMetadata?.userId ||
                     callMetadata?.customer?.userId ||
                     callMetadata?.user?.id;

      const agentName = callMetadata?.metadata?.agentName || 
                        callMetadata?.agentName ||
                        callMetadata?.assistant?.name?.replace('VASA-', '') ||
                        'Sarah';

      if (!userId) {
        console.error(`❌ Cannot process end-of-call for ${callId}: userId not found in metadata`);
        console.error('Available metadata paths:', Object.keys(callMetadata || {}));
        return;
      }

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
        exchangeCount: 0,
        narrativePhase: 'narrative_collection'
      };
    } else {
      session = {
        userId: dbSession.user_id,
        callId,
        agentName: dbSession.agent_name,
        currentCSSStage: 'pointed_origin',
        sessionStartTime: new Date(),
        processedTranscripts: new Set(),
        exchangeCount: 0,
        narrativePhase: 'narrative_collection'
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

  // Process full transcript and get patterns for summary generation
  let cssPatterns = null;
  if (fullTranscript) {
    cssPatterns = await processFullTranscript(session, fullTranscript);
  }

  // ENHANCED: Generate both basic and conversational summaries for session continuity
  if (summary || fullTranscript) {
    try {
      // Generate the enhanced summary using Phase 1 generator
      await generateEnhancedSessionSummary({
        userId: session.userId,
        callId: callId,
        transcript: fullTranscript,
        cssPatterns: cssPatterns,
        agentName: session.agentName,  // Already passing agent name here
        duration: duration
      });

      console.log(`📝 Enhanced session summary generated for continuity`);
    } catch (error) {
      console.error('Failed to generate enhanced summary:', error);

      // FIXED: Pass agent name in fallback case too
      if (summary) {
        await storeSessionContext(session.userId, callId, summary, 'call_summary', session.agentName);
      }
    }
  }

  // Cleanup from both caches
  activeSessions.delete(callId);
  checkedSessions.delete(callId);
  console.log(`✅ Session completed and cleaned up: ${callId}`);
}

// MODIFIED: Return patterns for use in summary generation
async function processFullTranscript(session: SessionState, transcript: string): Promise<any> {
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

  // Return patterns for use in summary generation
  return patterns;
}

async function storeCSSPatterns(session: SessionState, patterns: any): Promise<void> {
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