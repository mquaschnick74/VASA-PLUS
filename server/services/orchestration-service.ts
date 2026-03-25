// Simplified Orchestration Service - CSS tracking only
import { detectCSSPatterns, assessPatternConfidence } from './css-pattern-service';
import { supabase } from './supabase-service';
import { storeSessionContext } from './memory-service';
import { parseAssistantOutput, extractCSSStage, needsSafetyIntervention, extractRegister } from '../utils/parseAssistantOutput';
import { generateEnhancedSessionSummary } from './summary-service';
import { updateArcFromPatterns } from './sensing-layer/arc-tracker';

interface SessionState {
  userId: string;
  callId: string;
  agentName: string;
  currentCSSStage: string;
  sessionStartTime: Date;
  processedTranscripts: Set<string>;
  exchangeCount: number;
  narrativePhase: 'narrative_collection' | 'css_entry_assessment' | 'css_active';
  uploadId?: string | null;
}

// Two-tier cache system
const activeSessions = new Map<string, SessionState>();
const checkedSessions = new Set<string>();
const initializationLocks = new Map<string, Promise<SessionState | null>>();

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

export async function ensureSession(
  callId: string,
  userId?: string,
  agentName?: string
): Promise<SessionState | null> {
  if (activeSessions.has(callId)) {
    return activeSessions.get(callId)!;
  }

  if (initializationLocks.has(callId)) {
    return await initializationLocks.get(callId)!;
  }

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
  if (checkedSessions.has(callId)) {
    console.log(`⚠️ Session ${callId} already checked, not found in DB`);
    return null;
  }

  checkedSessions.add(callId);

  const { data: existing } = await supabase
    .from('therapeutic_sessions')
    .select('user_id, agent_name, start_time')
    .eq('call_id', callId)
    .single();

  if (existing) {
    console.log(`♻️ Restored session from DB: ${callId}`);
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

  if (!userId) {
    console.warn(`❌ Cannot create session ${callId}: no userId provided`);
    return null;
  }

  console.log(`🆕 Creating new session: ${callId}`);
  return await initializeSession(userId, callId, agentName || 'Unknown');
}

export async function initializeSession(
  userId: string,
  callId: string,
  agentName: string
): Promise<SessionState> {
  console.log(`🔍 Validating user exists: ${userId}`);

  const { data: userExists, error: userCheckError } = await supabase
    .from('users')
    .select('id, email, first_name')
    .eq('id', userId)
    .single();

  if (userCheckError || !userExists) {
    console.error(`❌ CRITICAL: User ${userId} does not exist in database!`);
    console.error(`   This will cause foreign key constraint violations.`);
    console.error(`   Error: ${userCheckError?.message || 'User not found'}`);
    console.error(`   Call ID: ${callId}`);
    console.error(`   Agent: ${agentName}`);

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

    console.error(`⚠️ Created in-memory session but DATABASE SAVE WILL FAIL`);
    return session;
  }

  console.log(`✅ User validated: ${userExists.email} (${userExists.first_name})`);

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
    console.log(`🔄 Attempting to save session to database:`, {
      call_id: callId,
      user_id: userId,
      user_email: userExists.email,
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
      console.error(`   Error hint: ${error.hint || 'N/A'}`);
      console.error(`   Error details: ${error.details || 'N/A'}`);
      console.error(`   User ID: ${userId}`);
      console.error(`   User Email: ${userExists.email}`);
      console.error(`   Call ID: ${callId}`);
      console.error(`   Full error object: ${JSON.stringify(error, null, 2)}`);

      if (error.code === '23503') {
        console.error(`   🔥 FOREIGN KEY VIOLATION: User ${userId} reference is invalid!`);
      } else if (error.code === '23505') {
        console.error(`   🔥 UNIQUE CONSTRAINT VIOLATION: Session with call_id ${callId} already exists!`);
      }
    } else {
      console.log(`✅ Session saved to database successfully!`);
      console.log(`   Session ID: ${data?.[0]?.id}`);
      console.log(`   Call ID: ${data?.[0]?.call_id}`);
      console.log(`   User: ${userExists.email}`);

      if (session.uploadId) {
        console.log(`🏷️ Marking upload ${session.uploadId} as addressed for call ${callId}`);
        await supabase
          .from('therapeutic_context')
          .update({
            metadata: {
              ...(data?.[0]?.metadata || {}),
              addressed_in_session: true,
              addressed_at: new Date().toISOString(),
              addressed_call_id: callId
            }
          })
          .eq('id', session.uploadId);
      }
    }
  } catch (dbError) {
    console.error(`❌ Database operation failed with exception:`, dbError);
    console.error(`   Exception type: ${dbError instanceof Error ? dbError.constructor.name : typeof dbError}`);
    console.error(`   Exception message: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    console.error(`   User ID: ${userId}`);
    console.error(`   Call ID: ${callId}`);
  }

  console.log(`✅ Session initialized: ${callId} for user ${userId} (${userExists.email})`);
  return session;
}

export async function processTranscript(
  callId: string,
  transcript: string,
  role: string,
  userId?: string,
  agentName?: string
): Promise<void> {
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

  if (role === 'assistant') {
    const parsed = parseAssistantOutput(transcript);

    const metaStage = extractCSSStage(parsed.meta);
    if (metaStage && metaStage !== 'NONE') {
      session.currentCSSStage = metaStage.toLowerCase();
      console.log(`📊 Assistant meta CSS stage: ${metaStage}`);
    }

    if (parsed.meta && 'phase' in parsed.meta) {
      session.narrativePhase = (parsed.meta as any).phase;
      console.log(`📖 Narrative phase: ${(parsed.meta as any).phase}`);
    }

    if (parsed.meta && 'exchange_count' in parsed.meta) {
      session.exchangeCount = (parsed.meta as any).exchange_count;
    }

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

      if (needsSafetyIntervention(parsed.meta)) {
        if (needsSafetyIntervention(parsed.meta)) {
          console.log(`🚨 Safety intervention triggered: ${(parsed.meta.safety as any)?.reason || 'Safety flag detected'}`);
        }
      }
    }

    return;
  }

  if (role !== 'user') {
    return;
  }

  session.exchangeCount++;

  const transcriptHash = Buffer.from(transcript).toString('base64').substring(0, 50);
  if (session.processedTranscripts.has(transcriptHash)) {
    console.log(`⏭️ Skipping duplicate transcript for ${callId}`);
    return;
  }
  session.processedTranscripts.add(transcriptHash);

  const patterns311 = await detectCSSPatterns(transcript, false);
  await storeCSSPatterns(session, patterns311);
  await updateArcFromPatterns(session.userId, session.callId, patterns311.thendIndicators, patterns311.cyvcPatterns);
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

  let cssPatterns = null;
  if (fullTranscript) {
    cssPatterns = await processFullTranscript(session, fullTranscript);
  }

  if (summary || fullTranscript) {
    try {
      await generateEnhancedSessionSummary({
        userId: session.userId,
        callId: callId,
        transcript: fullTranscript,
        cssPatterns: cssPatterns,
        agentName: session.agentName,
        duration: duration
      });

      console.log(`📝 Enhanced session summary generated for continuity`);
    } catch (error) {
      console.error('Failed to generate enhanced summary:', error);

      if (summary) {
        await storeSessionContext(session.userId, callId, summary, 'call_summary', session.agentName);
      }
    }
  }

  try {
    const presentedUploadId = callMetadata?.metadata?.uploadId || null;

    if (presentedUploadId) {
      const minExchanges = 4;
      const sessionExchanges = session.exchangeCount || 0;

      if (sessionExchanges >= minExchanges) {
        const { data: upload } = await supabase
          .from('therapeutic_context')
          .select('id, metadata')
          .eq('id', presentedUploadId)
          .eq('context_type', 'upload_analysis')
          .single();

        if (upload && upload.metadata?.addressed_in_session !== true) {
          const updatedMetadata = {
            ...upload.metadata,
            addressed_in_session: true,
            addressed_at: new Date().toISOString(),
            addressed_call_id: callId,
            exchange_count_at_marking: sessionExchanges
          };
          await supabase
            .from('therapeutic_context')
            .update({ metadata: updatedMetadata })
            .eq('id', presentedUploadId);

          console.log(`📋 [Upload] Marked upload ${presentedUploadId} as addressed (${sessionExchanges} exchanges in session ${callId})`);
        } else if (upload) {
          console.log(`📋 [Upload] Upload ${presentedUploadId} was already addressed`);
        } else {
          console.log(`📋 [Upload] Upload ${presentedUploadId} not found in therapeutic_context`);
        }
      } else {
        console.log(`📋 [Upload] Skipping marking upload ${presentedUploadId} — only ${sessionExchanges} exchanges (minimum: ${minExchanges})`);
      }
    } else {
      console.log(`📋 [Upload] No upload was presented in this session`);
    }
  } catch (err) {
    console.error('Failed to mark upload as addressed:', err);
  }

  activeSessions.delete(callId);
  checkedSessions.delete(callId);
  console.log(`✅ Session completed and cleaned up: ${callId}`);
}

async function processFullTranscript(session: SessionState, transcript: string): Promise<any> {
  const patterns = await detectCSSPatterns(transcript, true);
  const { confidence, reasoning } = assessPatternConfidence(patterns);

  console.log(`📊 Full transcript analysis:`);
  console.log(`  CSS Stage: ${patterns.currentStage}`);
  console.log(`  Patterns: CVDC=${patterns.cvdcPatterns.length}, IBM=${patterns.ibmPatterns.length}`);

  await supabase
    .from('session_transcripts')
    .insert({
      user_id: session.userId,
      call_id: session.callId,
      text: transcript,
      role: 'complete'
    });

  await storeCSSPatterns(session, patterns);
  await updateArcFromPatterns(session.userId, session.callId, patterns.thendIndicators, patterns.cyvcPatterns);

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