// Location: client/src/hooks/use-subscription.ts
// SAFE VERSION - Won't cause dashboard to fail

import { useState, useEffect } from 'react';

interface SubscriptionData {
  can_use_voice: boolean;
  minutes_remaining: number;
  minutes_used: number;
  minutes_limit: number;
  subscription_active: boolean;
  is_trial: boolean;
  trial_days_left: number;
  subscription_tier: string;
  user_type: string;
}

export function useSubscription(userId: string | null) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        console.log('Fetching subscription for:', userId);

        const response = await fetch(`/api/subscription/limits?userId=${userId}`);

        if (response.ok) {
          const subData = await response.json();
          console.log('Subscription data received:', subData);
          setData(subData);
        } else {
          // Don't fail catastrophically - just return defaults
          console.warn('Subscription fetch failed, using defaults');
          setData({
            can_use_voice: true,
            minutes_remaining: 45,
            minutes_used: 0,
            minutes_limit: 45,
            subscription_active: true,
            is_trial: true,
            trial_days_left: 30,
            subscription_tier: 'trial',
            user_type: 'therapist'
          });
        }
      } catch (err) {
        console.error('Subscription fetch error:', err);
        // Return safe defaults instead of failing
        setData({
          can_use_voice: true,
          minutes_remaining: 45,
          minutes_used: 0,
          minutes_limit: 45,
          subscription_active: true,
          is_trial: true,
          trial_days_left: 30,
          subscription_tier: 'trial',
          user_type: 'therapist'
        });
        setError('Failed to load subscription');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, [userId]);

  return { data, loading, error };
}