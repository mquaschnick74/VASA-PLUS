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
    // Query usage_sessions as the primary source of truth for what sessions actually occurred
    const { data: usageSessions, error: usageError } = await supabase
      .from('usage_sessions')
      .select('*')
      .eq('user_id', clientId)
      .order('session_date', { ascending: false });

    if (usageError) throw new Error('Failed to fetch sessions');

    // For each usage session, get the therapeutic_session details if available
    const sessionsWithMetadata = await Promise.all(
      (usageSessions || []).map(async (usageSession) => {
        // Try to find the corresponding therapeutic_session by vapi_call_id
        const { data: therapeuticSession } = await supabase
          .from('therapeutic_sessions')
          .select('*')
          .eq('call_id', usageSession.vapi_call_id)
          .maybeSingle();

        // Check for transcript
        const { data: transcript } = await supabase
          .from('session_transcripts')
          .select('id')
          .eq('call_id', usageSession.vapi_call_id)
          .maybeSingle();

        // Check for summary
        const { data: summary } = await supabase
          .from('therapeutic_context')
          .select('id')
          .eq('call_id', usageSession.vapi_call_id)
          .eq('context_type', 'call_summary')
          .maybeSingle();

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
    // Verify session belongs to client
    const { data: session, error: sessionError } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('call_id', callId)
      .eq('user_id', clientId)
      .maybeSingle();

    if (sessionError) {
      console.error('Error finding session:', sessionError);
      throw new Error('Session not found');
    }

    if (!session) {
      throw new Error('Session not found');
    }

    const { data: summaryData, error: summaryError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('call_id', callId)
      .eq('context_type', 'call_summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (summaryError || !summaryData) {
      throw new Error('Summary not found');
    }

    return {
      session_id: session.id,
      date: session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null,
      start_time: session.start_time,
      duration_minutes: session.duration_seconds ? Math.ceil(session.duration_seconds / 60) : 0,
      agent_name: session.agent_name || 'Unknown',
      summary: summaryData.content
    };
  }

  async getSessionTranscript(clientId: string, callId: string) {
    // sessionId is now actually the vapi_call_id (common identifier across tables)
    // Verify session belongs to client
    const { data: session, error: sessionError } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('call_id', callId)
      .eq('user_id', clientId)
      .maybeSingle();

    if (sessionError) {
      console.error('Error finding session:', sessionError);
      throw new Error('Session not found');
    }

    if (!session) {
      throw new Error('Session not found');
    }

    const { data: transcriptData, error: transcriptError } = await supabase
      .from('session_transcripts')
      .select('*')
      .eq('call_id', callId)
      .eq('role', 'complete')
      .maybeSingle();

    if (transcriptError || !transcriptData) {
      throw new Error('Transcript not found');
    }

    return {
      session_id: session.id,
      call_id: callId,
      date: session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null,
      start_time: session.start_time,
      duration_minutes: session.duration_seconds ? Math.ceil(session.duration_seconds / 60) : 0,
      agent_name: session.agent_name || 'Unknown',
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

export const therapistDataService = new TherapistDataService();