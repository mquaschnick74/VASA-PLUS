import { useQuery } from '@tanstack/react-query';

interface ClientStats {
  total_sessions: number;
  total_minutes: number;
  average_session_length: number;
  first_session_date: string;
  last_session_date: string;
  sessions_by_month: Array<{ month: string; count: number }>;
}

export function useClientStats(clientId: string | undefined) {
  return useQuery<ClientStats>({
    queryKey: ['client-stats', clientId],
    queryFn: async () => {
      const response = await fetch(`/api/therapist/client/${clientId}/stats`, {
        headers: {
          'Authorization': `Bearer ${(await window.supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    enabled: !!clientId
  });
}