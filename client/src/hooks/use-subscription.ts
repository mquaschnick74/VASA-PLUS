// client/src/hooks/use-subscription.ts
// FIXED VERSION - Returns correct nested structure for your components

import { useState, useEffect } from 'react';

interface SubscriptionLimits {
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

interface SubscriptionData {
  limits: SubscriptionLimits;  // Your component expects data.limits.minutes_remaining
}

const DEFAULT_SUBSCRIPTION: SubscriptionData = {
  limits: {
    can_use_voice: true,
    minutes_remaining: 45,
    minutes_used: 0,
    minutes_limit: 45,
    subscription_active: true,
    is_trial: true,
    trial_days_left: 30,
    subscription_tier: 'trial',
    user_type: 'individual'
  }
};

export function useSubscription(userId: string | null) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);  // Your component uses 'isLoading'
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      console.log('No userId for subscription');
      setData(DEFAULT_SUBSCRIPTION);
      setIsLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      try {
        console.log('Fetching subscription for:', userId);
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/subscription/limits?userId=${userId}`);

        if (!response.ok) {
          console.warn('Subscription API returned:', response.status);
          setData(DEFAULT_SUBSCRIPTION);
          setError(`API returned ${response.status}`);
          setIsLoading(false);
          return;
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('Response is not JSON, got:', contentType);
          setData(DEFAULT_SUBSCRIPTION);
          setError('Invalid response format');
          setIsLoading(false);
          return;
        }

        const subData = await response.json();
        console.log('Raw subscription data:', subData);

        // Wrap the flat response in the expected nested structure
        const formattedData: SubscriptionData = {
          limits: subData  // Nest under 'limits'
        };

        console.log('Formatted subscription data:', formattedData);
        setData(formattedData);
        setError(null);

      } catch (err) {
        console.error('Subscription fetch error:', err);
        setData(DEFAULT_SUBSCRIPTION);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscription();
  }, [userId]);

  // Return with the exact property names your component expects
  return { 
    data,      // Will be null initially, then have .limits nested structure
    isLoading, // Not 'loading' - your component uses 'isLoading'
    error 
  };
}

// Export types for other components
export type { SubscriptionData, SubscriptionLimits };
export { DEFAULT_SUBSCRIPTION };