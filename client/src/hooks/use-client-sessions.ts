import { useQuery } from '@tanstack/react-query';

interface Session {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  agent_name: string;
  has_transcript: boolean;
  has_summary: boolean;
}

interface SessionsResponse {
  sessions: Session[];
  total_sessions: number;
  total_minutes: number;
}

export function useClientSessions(clientId: string | undefined) {
  return useQuery<SessionsResponse>({
    queryKey: ['client-sessions', clientId],
    queryFn: async () => {
      const response = await fetch(`/api/therapist/client/${clientId}/sessions`, {
        headers: {
          'Authorization': `Bearer ${(await window.supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch sessions');
      return response.json();
    },
    enabled: !!clientId
  });
}