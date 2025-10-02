import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

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
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/therapist/client/${clientId}/stats`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    enabled: !!clientId
  });
}