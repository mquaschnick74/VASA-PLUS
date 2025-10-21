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
    accessType: 'session_list' | 'session_summary' | 'session_transcript',
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
    const { data: sessions, error } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', clientId)
      .order('start_time', { ascending: false });

    if (error) throw new Error('Failed to fetch sessions');

    const sessionsWithMetadata = await Promise.all(
      (sessions || []).map(async (session) => {
        const { data: transcript } = await supabase
          .from('session_transcripts')
          .select('id')
          .eq('call_id', session.call_id)
          .single();

        const { data: summary } = await supabase
          .from('therapeutic_context')
          .select('id')
          .eq('call_id', session.call_id)
          .eq('context_type', 'call_summary')
          .single();

        return {
          id: session.id,
          date: session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null,
          start_time: session.start_time,
          duration_minutes: session.duration_seconds ? Math.ceil(session.duration_seconds / 60) : 0,
          agent_name: session.agent_name || 'Unknown',
          status: session.status,
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

  async getSessionSummary(clientId: string, sessionId: string) {
    const { data: session, error: sessionError } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', clientId)
      .single();

    if (sessionError || !session) {
      throw new Error('Session not found');
    }

    const { data: summaryData, error: summaryError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('call_id', session.call_id)
      .eq('context_type', 'call_summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

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

  async getSessionTranscript(clientId: string, sessionId: string) {
    const { data: session, error: sessionError } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', clientId)
      .single();

    if (sessionError || !session) {
      throw new Error('Session not found');
    }

    const { data: transcriptData, error: transcriptError } = await supabase
      .from('session_transcripts')
      .select('*')
      .eq('call_id', session.call_id)
      .eq('role', 'complete')
      .single();

    if (transcriptError || !transcriptData) {
      throw new Error('Transcript not found');
    }

    return {
      session_id: session.id,
      date: session.start_time ? new Date(session.start_time).toISOString().split('T')[0] : null,
      start_time: session.start_time,
      duration_minutes: session.duration_seconds ? Math.ceil(session.duration_seconds / 60) : 0,
      agent_name: session.agent_name || 'Unknown',
      transcript: transcriptData.text,
      accessed_at: new Date().toISOString()
    };
  }

  async getClientStats(clientId: string): Promise<SessionStats> {
    const { data: sessions, error } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', clientId)
      .order('start_time', { ascending: true });

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
    const totalMinutes = sessions.reduce((sum, s) => sum + Math.ceil((s.duration_seconds || 0) / 60), 0);
    const averageSessionLength = Math.round(totalMinutes / totalSessions);

    const sessionsByMonth: { [key: string]: number } = {};
    sessions.forEach(session => {
      if (session.start_time) {
        const date = new Date(session.start_time);
        const monthKey = `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
        sessionsByMonth[monthKey] = (sessionsByMonth[monthKey] || 0) + 1;
      }
    });

    return {
      total_sessions: totalSessions,
      total_minutes: totalMinutes,
      average_session_length: averageSessionLength,
      first_session_date: sessions[0].start_time,
      last_session_date: sessions[sessions.length - 1].start_time,
      sessions_by_month: Object.entries(sessionsByMonth).map(([month, count]) => ({ month, count }))
    };
  }
}

export const therapistDataService = new TherapistDataService();