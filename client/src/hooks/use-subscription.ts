// Location: client/src/hooks/use-subscription.ts
// CORRECT VERSION - Returns nested structure that matches your component

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
  limits: SubscriptionLimits;  // NESTED under 'limits'
}

const DEFAULT_SUBSCRIPTION: SubscriptionData = {
  limits: {  // NESTED structure
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
  const [isLoading, setIsLoading] = useState(true);  // Changed from 'loading' to 'isLoading' to match your component
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
          // Use defaults instead of crashing
          setData(DEFAULT_SUBSCRIPTION);
          setError(`API returned ${response.status}`);
        } else {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const subData = await response.json();
            console.log('Raw subscription data received:', subData);

            // Wrap the response in the expected structure
            const formattedData: SubscriptionData = {
              limits: subData  // Nest under 'limits'
            };

            console.log('Formatted subscription data:', formattedData);
            setData(formattedData);
          } else {
            console.error('Response is not JSON');
            setData(DEFAULT_SUBSCRIPTION);
            setError('Invalid response format');
          }
        }
      } catch (err) {
        console.error('Subscription fetch error:', err);
        // Always return safe defaults on error
        setData(DEFAULT_SUBSCRIPTION);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSubscription();
  }, [userId]);

  // Return with the property names your component expects
  return { 
    data,      // Can be null during loading
    isLoading, // Changed from 'loading'
    error 
  };
}

// Export for components that need the type
export type { SubscriptionData, SubscriptionLimits };
export { DEFAULT_SUBSCRIPTION };