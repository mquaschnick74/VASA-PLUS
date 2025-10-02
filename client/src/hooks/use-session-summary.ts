import { useQuery } from '@tanstack/react-query';

interface SessionSummary {
  session_id: string;
  date: string;
  duration_minutes: number;
  agent_name: string;
  summary: string;
}

export function useSessionSummary(clientId: string | undefined, sessionId: string | undefined) {
  return useQuery<SessionSummary>({
    queryKey: ['session-summary', clientId, sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/therapist/client/${clientId}/session/${sessionId}/summary`, {
        headers: {
          'Authorization': `Bearer ${(await window.supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch summary');
      return response.json();
    },
    enabled: !!clientId && !!sessionId
  });
}