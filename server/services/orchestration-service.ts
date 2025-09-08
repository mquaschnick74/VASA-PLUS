// Orchestration Service
// Manages agent routing, session state, and intervention coordination

import { detectDistressLevel, shouldTriggerHSFB, DistressAssessment } from './distress-detection-service';
import { startHSFBIntervention, completeHSFBIntervention, hadRecentSuccessfulIntervention } from './hsfb-intervention-service';
import { detectCSSPatterns, assessPatternConfidence } from './css-pattern-service';
import { supabase } from './supabase-service';
import { storeSessionContext } from './memory-service';

// Session state management
interface SessionState {
  userId: string;
  callId: string;
  agentName: string;
  currentCSSStage: string;
  distressHistory: DistressAssessment[];
  activeIntervention?: any;
  lastAssessmentTime?: Date;
  sessionStartTime: Date;
}

// In-memory session state storage
const activeSessions = new Map<string, SessionState>();

/**
 * Initialize session
 */
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
    distressHistory: [],
    sessionStartTime: new Date()
  };

  activeSessions.set(callId, session);

  // Create database session
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

  console.log(`🎭 Session initialized: ${callId} with agent ${agentName}`);
  return session;
}

/**
 * Process transcript and orchestrate response
 */
export async function processTranscript(
  callId: string,
  transcript: string,
  role: string
): Promise<any> {
  const session = activeSessions.get(callId);
  if (!session) {
    console.warn(`No active session found for ${callId}`);
    return { action: 'continue' };
  }

  // Only process user transcripts for distress
  if (role !== 'user') {
    return { action: 'continue' };
  }

  console.log(`🎭 Orchestrating response for ${callId}`);

  // 1. Store transcript
  await supabase
    .from('session_transcripts')
    .insert({
      user_id: session.userId,
      call_id: callId,
      text: transcript,
      role: role
    });

  // 2. Detect distress
  const distressAssessment = detectDistressLevel(transcript, false);

  // 3. Store distress assessment
  await supabase
    .from('distress_assessments')
    .insert({
      user_id: session.userId,
      call_id: callId,
      transcript_segment: transcript.substring(0, 500),
      distress_level: distressAssessment.level,
      distress_category: distressAssessment.category,
      confidence: distressAssessment.confidence,
      detected_patterns: distressAssessment.triggers,
      agent_name: session.agentName,
      requires_grounding: distressAssessment.requiresGrounding,
      css_stage: session.currentCSSStage
    });

  // 4. Check if HSFB should trigger
  const shouldIntervene = shouldTriggerHSFB(distressAssessment, session.distressHistory);

  if (shouldIntervene) {
    console.log(`🚨 Triggering HSFB: Distress ${distressAssessment.level}/10`);

    // Start intervention
    const intervention = await startHSFBIntervention(
      session.userId,
      callId,
      session.agentName,
      distressAssessment,
      transcript,
      session.currentCSSStage
    );

    if (intervention) {
      session.activeIntervention = intervention;

      return {
        action: 'trigger_hsfb',
        intervention: {
          id: intervention.id,
          prompt: intervention.interventionPrompt,
          modality: intervention.modalityFocus,
          distressLevel: distressAssessment.level,
          category: distressAssessment.category
        }
      };
    }
  }

  // 5. If no intervention needed, check CSS patterns
  if (distressAssessment.level < 5) {
    const patterns = detectCSSPatterns(transcript, false);

    if (patterns.currentStage !== session.currentCSSStage) {
      console.log(`📊 CSS Stage progression: ${session.currentCSSStage} → ${patterns.currentStage}`);
      session.currentCSSStage = patterns.currentStage;

      // Store stage progression
      await supabase
        .from('css_progressions')
        .insert({
          user_id: session.userId,
          call_id: callId,
          from_stage: session.currentCSSStage,
          to_stage: patterns.currentStage,
          trigger_content: transcript.substring(0, 200),
          agent_name: session.agentName
        });
    }

    // Store detected patterns
    await storeCSSPatterns(session, patterns);
  }

  // 6. Update distress history
  session.distressHistory.push(distressAssessment);
  if (session.distressHistory.length > 10) {
    session.distressHistory.shift();
  }

  session.lastAssessmentTime = new Date();

  return { action: 'continue' };
}

/**
 * Complete active intervention
 */
export async function completeIntervention(
  callId: string,
  postTranscript: string,
  duration: number
): Promise<any> {
  const session = activeSessions.get(callId);
  if (!session || !session.activeIntervention) {
    return { success: false, error: 'No active intervention' };
  }

  // Assess post-intervention distress
  const postAssessment = detectDistressLevel(postTranscript, false);

  // Complete intervention
  const effectiveness = await completeHSFBIntervention(
    session.activeIntervention.id,
    postAssessment,
    postTranscript,
    duration
  );

  // Clear active intervention
  session.activeIntervention = undefined;

  console.log(`✅ Intervention completed: Effectiveness ${effectiveness}/10`);

  return {
    success: true,
    effectiveness,
    distressReduction: session.distressHistory[session.distressHistory.length - 1].level - postAssessment.level
  };
}

/**
 * Process end of call
 */
export async function processEndOfCall(
  callId: string,
  fullTranscript?: string,
  summary?: string,
  callMetadata?: any
): Promise<void> {
  let session = activeSessions.get(callId);

  // If no active session, check if session exists in database
  if (!session) {
    const { data: dbSession } = await supabase
      .from('therapeutic_sessions')
      .select('user_id, agent_name')
      .eq('call_id', callId)
      .single();

    if (!dbSession) {
      // Create session from end-of-call if it doesn't exist
      console.log('🚀 Creating session from end-of-call-report');

      const userId = callMetadata?.metadata?.userId || callMetadata?.assistant?.metadata?.userId;
      const agentName = callMetadata?.metadata?.agentName || 
                       callMetadata?.assistant?.metadata?.agentName || 
                       'Sarah';

      if (!userId) {
        console.error('Cannot create session without userId');
        return;
      }

      // Calculate duration
      let duration = callMetadata?.duration || 0;
      if (!duration || duration === 0) {
        if (callMetadata?.startedAt && callMetadata?.endedAt) {
          const startTime = new Date(callMetadata.startedAt).getTime();
          const endTime = new Date(callMetadata.endedAt).getTime();
          duration = Math.round((endTime - startTime) / 1000);
          console.log(`📐 Calculated duration from timestamps: ${duration} seconds`);
        } else {
          console.warn('⚠️ No duration or timestamps available, using default 60 seconds');
          duration = 60;
        }
      }

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

      // Create minimal session for processing
      session = {
        userId,
        callId,
        agentName,
        currentCSSStage: 'pointed_origin',
        distressHistory: [],
        sessionStartTime: new Date(Date.now() - (duration * 1000))
      };
    } else {
      // Create minimal session from database data
      session = {
        userId: dbSession.user_id,
        callId,
        agentName: dbSession.agent_name,
        currentCSSStage: 'pointed_origin',
        distressHistory: [],
        sessionStartTime: new Date()
      };
    }
  }

  console.log(`📊 Processing end of call for ${callId}`);

  // Calculate session statistics
  const distressLevels = session.distressHistory.map(d => d.level);
  const maxDistress = distressLevels.length > 0 ? Math.max(...distressLevels) : 0;
  const avgDistress = distressLevels.length > 0 
    ? distressLevels.reduce((a, b) => a + b, 0) / distressLevels.length 
    : 0;

  // Count interventions
  const { count: interventionCount } = await supabase
    .from('hsfb_interventions')
    .select('*', { count: 'exact', head: true })
    .eq('call_id', callId);

  // Calculate duration with fallbacks
  let duration = callMetadata?.duration || 0;
  if (!duration || duration === 0) {
    if (callMetadata?.startedAt && callMetadata?.endedAt) {
      const startTime = new Date(callMetadata.startedAt).getTime();
      const endTime = new Date(callMetadata.endedAt).getTime();
      duration = Math.round((endTime - startTime) / 1000);
      console.log(`📐 Calculated duration from timestamps: ${duration} seconds`);
    } else if (session.sessionStartTime) {
      duration = Math.floor((Date.now() - session.sessionStartTime.getTime()) / 1000);
      console.log(`📐 Calculated duration from session start: ${duration} seconds`);
    } else {
      console.warn('⚠️ No duration available, using default 60 seconds');
      duration = 60;
    }
  }

  await supabase
    .from('therapeutic_sessions')
    .update({
      status: 'completed',
      end_time: new Date().toISOString(),
      duration_seconds: duration,
      max_distress_level: maxDistress,
      average_distress_level: avgDistress,
      hsfb_interventions_count: interventionCount || 0,
      metadata: callMetadata
    })
    .eq('call_id', callId);

  // Process full transcript if provided
  if (fullTranscript) {
    await processFullTranscript(session, fullTranscript);
  }

  // Store summary if provided
  if (summary) {
    await storeSessionContext(session.userId, callId, summary, 'call_summary');
  }

  // Clean up session
  activeSessions.delete(callId);

  console.log(`✅ Session completed: Max distress=${maxDistress}, Interventions=${interventionCount}`);
}

/**
 * Process full transcript for patterns
 */
async function processFullTranscript(session: SessionState, transcript: string): Promise<void> {
  // Run comprehensive CSS analysis
  const patterns = detectCSSPatterns(transcript, true);
  const { confidence, reasoning } = assessPatternConfidence(patterns);

  console.log(`📊 Full transcript analysis:`);
  console.log(`  CSS Stage: ${patterns.currentStage}`);
  console.log(`  Patterns: CVDC=${patterns.cvdcPatterns.length}, IBM=${patterns.ibmPatterns.length}`);

  // Store complete transcript
  await supabase
    .from('session_transcripts')
    .insert({
      user_id: session.userId,
      call_id: session.callId,
      text: transcript,
      role: 'complete'
    });

  // Store all detected patterns
  await storeCSSPatterns(session, patterns);

  // Store overall assessment
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

/**
 * Store CSS patterns
 */
async function storeCSSPatterns(session: SessionState, patterns: any): Promise<void> {
  const patternInserts = [];

  // Store CVDC patterns
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

  // Store IBM patterns
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

  // Store Thend indicators
  for (const thend of patterns.thendIndicators) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'Thend',
      content: thend,
      css_stage: patterns.currentStage === 'pointed_origin' ? 'suspension' : patterns.currentStage,
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  // Store CYVC patterns
  for (const cyvc of patterns.cyvcPatterns) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'CYVC',
      content: cyvc,
      css_stage: ['completion', 'terminal'].includes(patterns.currentStage) 
        ? patterns.currentStage 
        : 'completion',
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  if (patternInserts.length > 0) {
    await supabase
      .from('css_patterns')
      .insert(patternInserts);
  }
}

/**
 * Get agent recommendation based on distress
 */
export function recommendAgent(distressCategory: string): string {
  const agentMap: Record<string, string> = {
    panic: 'sarah',
    overwhelm: 'sarah',
    somatic: 'sarah',
    fragmentation: 'mathew',
    dissociation: 'mathew'
  };

  return agentMap[distressCategory] || 'sarah';
}

/**
 * Check if agent switch is needed
 */
export function shouldSwitchAgent(
  currentAgent: string,
  distressCategory: string,
  distressLevel: number
): boolean {
  if (distressLevel < 7) return false;

  const recommended = recommendAgent(distressCategory);
  return currentAgent !== recommended;
}

// Export for testing
export const testExports = {
  activeSessions
};