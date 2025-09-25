import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export function useSubscription(userId: string | undefined) {
  return useQuery({
    queryKey: ['subscription', userId],
    queryFn: async () => {
      if (!userId) return null;

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return null;

      const response = await fetch(`/api/subscription/status/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch subscription');
      return response.json();
    },
    enabled: !!userId,
    staleTime: 60000, // Cache for 1 minute
  });
}