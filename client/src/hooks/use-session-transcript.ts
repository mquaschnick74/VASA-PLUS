import { useQuery } from '@tanstack/react-query';

interface SessionTranscript {
  session_id: string;
  date: string;
  duration_minutes: number;
  agent_name: string;
  transcript: string;
  accessed_at: string;
}

export function useSessionTranscript(clientId: string | undefined, sessionId: string | undefined) {
  return useQuery<SessionTranscript>({
    queryKey: ['session-transcript', clientId, sessionId],
    queryFn: async () => {
      const response = await fetch(`/api/therapist/client/${clientId}/session/${sessionId}/transcript`, {
        headers: {
          'Authorization': `Bearer ${(await window.supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch transcript');
      return response.json();
    },
    enabled: !!clientId && !!sessionId,
    staleTime: 0 // Always fetch fresh for security
  });
}