// server/services/therapist-data-service.ts
import { supabase } from './supabase-service';

interface SessionData {
  id: string;
  date: string | null;
  start_time: string | null;
  duration_minutes: number;
  agent_name: string;
  status: string;
  has_transcript: boolean;
  has_summary: boolean;
}

interface SessionStats {
  total_sessions: number;
  total_minutes: number;
  average_session_length: number;
  first_session_date: string | null;
  last_session_date: string | null;
  sessions_by_month: Array<{ month: string; count: number }>;
}

export class TherapistDataService {

  async verifyTherapistClientRelationship(therapistId: string, clientId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('therapist_client_relationships')
      .select('*')
      .eq('therapist_id', therapistId)
      .eq('client_id', clientId)
      .eq('status', 'active')
      .single();

    return !error && !!data;
  }

  async logAccess(
    therapistId: string,
    clientId: string,
    accessType: 'session_list' | 'session_summary' | 'session_transcript' | 'pca_analysis',
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await supabase.from('therapist_access_logs').insert({
        therapist_id: therapistId,
        client_id: clientId,
        access_type: accessType,
        session_id: sessionId || null,
        ip_address: ipAddress || 'unknown',
        user_agent: userAgent || 'unknown'
      });
    } catch (error) {
      console.error('Failed to log access:', error);
    }
  }

  async getClientSessions(clientId: string): Promise<{ sessions: SessionData[]; total_sessions: number; total_minutes: number }> {
    console.log(`📊 [THERAPIST-DATA] getClientSessions called for clientId=${clientId}`);

    // Query usage_sessions as the primary source of truth for what sessions actually occurred
    const { data: usageSessions, error: usageError } = await supabase
      .from('usage_sessions')
      .select('*')
      .eq('user_id', clientId)
      .order('session_date', { ascending: false });

    if (usageError) throw new Error('Failed to fetch sessions');

    console.log(`📊 [THERAPIST-DATA] Found ${usageSessions?.length || 0} usage sessions`);

    // For each usage session, get the therapeutic_session details if available
    const sessionsWithMetadata = await Promise.all(
      (usageSessions || []).map(async (usageSession, index) => {
        console.log(`  📝 [THERAPIST-DATA] Processing session ${index + 1}: vapi_call_id=${usageSession.vapi_call_id}`);

        // Try to find the corresponding therapeutic_session by vapi_call_id
        const { data: therapeuticSession } = await supabase
          .from('therapeutic_sessions')
          .select('*')
          .eq('call_id', usageSession.vapi_call_id)
          .maybeSingle();

        console.log(`    ${therapeuticSession ? '✅' : '⚠️'} [THERAPIST-DATA] Therapeutic session ${therapeuticSession ? 'found' : 'NOT found'} for call_id=${usageSession.vapi_call_id}`);

        // Check for transcript (must have role='complete' to be viewable)
        const { data: transcript } = await supabase
          .from('session_transcripts')
          .select('id')
          .eq('call_id', usageSession.vapi_call_id)
          .eq('role', 'complete')
          .maybeSingle();

        console.log(`    ${transcript ? '✅' : '⚠️'} [THERAPIST-DATA] Transcript ${transcript ? 'found' : 'NOT found'}`);

        // Check for summary
        const { data: summary } = await supabase
          .from('therapeutic_context')
          .select('id')
          .eq('call_id', usageSession.vapi_call_id)
          .eq('context_type', 'call_summary')
          .maybeSingle();

        console.log(`    ${summary ? '✅' : '⚠️'} [THERAPIST-DATA] Summary ${summary ? 'found' : 'NOT found'}`);

        return {
          id: usageSession.vapi_call_id, // Use vapi_call_id as the common identifier across tables
          date: usageSession.session_date ? new Date(usageSession.session_date).toISOString().split('T')[0] : null,
          start_time: therapeuticSession?.start_time || usageSession.session_date,
          duration_minutes: usageSession.duration_minutes,
          agent_name: therapeuticSession?.agent_name || 'Unknown',
          status: therapeuticSession?.status || 'completed',
          has_transcript: !!transcript,
          has_summary: !!summary
        };
      })
    );

    const totalMinutes = sessionsWithMetadata.reduce((sum, s) => sum + s.duration_minutes, 0);

    return {
      sessions: sessionsWithMetadata,
      total_sessions: sessionsWithMetadata.length,
      total_minutes: totalMinutes
    };
  }

  async getSessionSummary(clientId: string, callId: string) {
    // sessionId is now actually the vapi_call_id (common identifier across tables)
    console.log(`📋 [THERAPIST-DATA] getSessionSummary called with clientId=${clientId}, callId=${callId}`);

    // Fetch summary directly - it's stored in therapeutic_context indexed by call_id
    const { data: summaryData, error: summaryError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('call_id', callId)
      .eq('context_type', 'call_summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (summaryError) {
      console.error('❌ [THERAPIST-DATA] Error fetching summary:', summaryError);
      throw new Error('Summary not found');
    }

    if (!summaryData) {
      console.log(`⚠️ [THERAPIST-DATA] No summary found for call_id=${callId}`);
      throw new Error('Summary not found');
    }

    console.log(`✅ [THERAPIST-DATA] Summary found, length=${summaryData.content?.length || 0} chars`);

    // Try to get session metadata from therapeutic_sessions (may not exist for all sessions)
    const { data: therapeuticSession } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('call_id', callId)
      .maybeSingle();

    // Fallback to usage_sessions for basic metadata if therapeutic_sessions doesn't have it
    const { data: usageSession } = await supabase
      .from('usage_sessions')
      .select('*')
      .eq('vapi_call_id', callId)
      .eq('user_id', clientId)
      .maybeSingle();

    console.log(`📊 [THERAPIST-DATA] Session metadata - therapeutic: ${!!therapeuticSession}, usage: ${!!usageSession}`);

    return {
      session_id: therapeuticSession?.id || callId,
      date: therapeuticSession?.start_time
        ? new Date(therapeuticSession.start_time).toISOString().split('T')[0]
        : usageSession?.session_date
          ? new Date(usageSession.session_date).toISOString().split('T')[0]
          : null,
      start_time: therapeuticSession?.start_time || usageSession?.session_date,
      duration_minutes: therapeuticSession?.duration_seconds
        ? Math.ceil(therapeuticSession.duration_seconds / 60)
        : usageSession?.duration_minutes || 0,
      agent_name: therapeuticSession?.agent_name || 'Unknown',
      summary: summaryData.content
    };
  }

  async getSessionTranscript(clientId: string, callId: string) {
    // sessionId is now actually the vapi_call_id (common identifier across tables)
    console.log(`📄 [THERAPIST-DATA] getSessionTranscript called with clientId=${clientId}, callId=${callId}`);

    // Fetch transcript directly - it's stored in session_transcripts indexed by call_id
    const { data: transcriptData, error: transcriptError } = await supabase
      .from('session_transcripts')
      .select('*')
      .eq('call_id', callId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transcriptError) {
      console.error('❌ [THERAPIST-DATA] Error fetching transcript:', transcriptError);
      throw new Error('Transcript not found');
    }

    if (!transcriptData) {
      console.log(`⚠️ [THERAPIST-DATA] No transcript found for call_id=${callId}`);
      throw new Error('Transcript not found');
    }

    console.log(`✅ [THERAPIST-DATA] Transcript found, role=${transcriptData.role}, length=${transcriptData.text?.length || 0} chars`);

    // Try to get session metadata from therapeutic_sessions (may not exist for all sessions)
    const { data: therapeuticSession } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('call_id', callId)
      .maybeSingle();

    // Fallback to usage_sessions for basic metadata if therapeutic_sessions doesn't have it
    const { data: usageSession } = await supabase
      .from('usage_sessions')
      .select('*')
      .eq('vapi_call_id', callId)
      .eq('user_id', clientId)
      .maybeSingle();

    console.log(`📊 [THERAPIST-DATA] Session metadata - therapeutic: ${!!therapeuticSession}, usage: ${!!usageSession}`);

    return {
      session_id: therapeuticSession?.id || callId,
      call_id: callId,
      date: therapeuticSession?.start_time
        ? new Date(therapeuticSession.start_time).toISOString().split('T')[0]
        : usageSession?.session_date
          ? new Date(usageSession.session_date).toISOString().split('T')[0]
          : null,
      start_time: therapeuticSession?.start_time || usageSession?.session_date,
      duration_minutes: therapeuticSession?.duration_seconds
        ? Math.ceil(therapeuticSession.duration_seconds / 60)
        : usageSession?.duration_minutes || 0,
      agent_name: therapeuticSession?.agent_name || 'Unknown',
      transcript: transcriptData.text,
      accessed_at: new Date().toISOString()
    };
  }

  async getClientStats(clientId: string): Promise<SessionStats> {
    // Query usage_sessions as the primary source of truth
    const { data: sessions, error } = await supabase
      .from('usage_sessions')
      .select('*')
      .eq('user_id', clientId)
      .order('session_date', { ascending: true });

    if (error) throw new Error('Failed to fetch sessions');

    if (!sessions || sessions.length === 0) {
      return {
        total_sessions: 0,
        total_minutes: 0,
        average_session_length: 0,
        first_session_date: null,
        last_session_date: null,
        sessions_by_month: []
      };
    }

    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const averageSessionLength = Math.round(totalMinutes / totalSessions);

    const sessionsByMonth: { [key: string]: number } = {};
    sessions.forEach(session => {
      if (session.session_date) {
        const date = new Date(session.session_date);
        const monthKey = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
        sessionsByMonth[monthKey] = (sessionsByMonth[monthKey] || 0) + 1;
      }
    });

    return {
      total_sessions: totalSessions,
      total_minutes: totalMinutes,
      average_session_length: averageSessionLength,
      first_session_date: sessions[0].session_date,
      last_session_date: sessions[sessions.length - 1].session_date,
      sessions_by_month: Object.entries(sessionsByMonth).map(([month, count]) => ({ month, count }))
    };
  }
}

  // ============================================================================
  // DISCONNECT & ARCHIVE METHODS
  // ============================================================================

  /**
   * Snapshot all client sessions into archived_client_sessions table.
   * This creates a permanent record owned by the therapist, independent of live data.
   */
  async snapshotClientSessions(
    therapistId: string,
    clientId: string,
    relationshipId: string,
    clientEmail: string,
    clientFullName: string
  ): Promise<number> {
    console.log(`📦 [THERAPIST-DATA] Snapshotting sessions for client=${clientId}, therapist=${therapistId}`);

    // Get all usage_sessions for the client
    const { data: usageSessions, error: usageError } = await supabase
      .from('usage_sessions')
      .select('*')
      .eq('user_id', clientId)
      .order('session_date', { ascending: true });

    if (usageError) {
      console.error('❌ [THERAPIST-DATA] Error fetching usage sessions for snapshot:', usageError);
      throw new Error('Failed to fetch sessions for archival');
    }

    if (!usageSessions || usageSessions.length === 0) {
      console.log('ℹ️ [THERAPIST-DATA] No sessions to archive for client:', clientId);
      return 0;
    }

    let archivedCount = 0;

    for (const usageSession of usageSessions) {
      const callId = usageSession.vapi_call_id;

      // Get therapeutic session metadata
      const { data: therapeuticSession } = await supabase
        .from('therapeutic_sessions')
        .select('*')
        .eq('call_id', callId)
        .maybeSingle();

      // Get transcript
      const { data: transcript } = await supabase
        .from('session_transcripts')
        .select('text')
        .eq('call_id', callId)
        .eq('role', 'complete')
        .maybeSingle();

      // Get summary from therapeutic_context
      const { data: summary } = await supabase
        .from('therapeutic_context')
        .select('content')
        .eq('call_id', callId)
        .eq('context_type', 'call_summary')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Insert archived session
      const { error: insertError } = await supabase
        .from('archived_client_sessions')
        .insert({
          therapist_id: therapistId,
          relationship_id: relationshipId,
          original_client_id: clientId,
          client_email: clientEmail,
          client_full_name: clientFullName,
          call_id: callId,
          session_date: usageSession.session_date,
          duration_minutes: usageSession.duration_minutes || 0,
          agent_name: therapeuticSession?.agent_name || 'Unknown',
          summary_content: summary?.content || null,
          transcript_text: transcript?.text || null,
        });

      if (insertError) {
        console.error(`❌ [THERAPIST-DATA] Error archiving session ${callId}:`, insertError);
      } else {
        archivedCount++;
      }
    }

    console.log(`✅ [THERAPIST-DATA] Archived ${archivedCount}/${usageSessions.length} sessions`);
    return archivedCount;
  }

  /**
   * Check if therapist has a terminated (archived) relationship with a client.
   */
  async verifyTherapistArchivedAccess(therapistId: string, clientId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('therapist_client_relationships')
      .select('id')
      .eq('therapist_id', therapistId)
      .eq('client_id', clientId)
      .in('status', ['terminated_by_therapist', 'terminated_by_client_request'])
      .maybeSingle();

    return !error && !!data;
  }

  /**
   * Get archived session data for a former client.
   */
  async getArchivedClientSessions(therapistId: string, originalClientId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('archived_client_sessions')
      .select('*')
      .eq('therapist_id', therapistId)
      .eq('original_client_id', originalClientId)
      .order('session_date', { ascending: false });

    if (error) {
      console.error('❌ [THERAPIST-DATA] Error fetching archived sessions:', error);
      throw new Error('Failed to fetch archived sessions');
    }

    return data || [];
  }
}

export const therapistDataService = new TherapistDataService();