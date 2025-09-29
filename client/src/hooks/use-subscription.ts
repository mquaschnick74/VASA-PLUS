// Location: client/src/hooks/use-subscription.ts
// FIXED VERSION - Properly structures subscription data

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface SubscriptionData {
  limits: {
    minutes_remaining: number;
    subscription_tier: string;
    subscription_status: string;
    client_limit: number;
  };
  user_id: string;
  subscription_tier: string;
  subscription_status: string;
  plan_type: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  usage_minutes_limit: number;
  usage_minutes_used: number;
  client_limit: number;
  clients_used: number;
}

export function useSubscription(userId: string | null) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setData(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const loadSubscription = async () => {
      try {
        console.log('📊 Loading subscription for user:', userId);
        setIsLoading(true);
        setError(null);

        // Get subscription from database
        const { data: subscription, error: subError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (subError) {
          console.error('Subscription fetch error:', subError);
          throw new Error('Failed to load subscription');
        }

        if (!isMounted) return;

        if (subscription) {
          // Calculate minutes remaining
          const minutesRemaining = Math.max(
            0, 
            (subscription.usage_minutes_limit || 0) - (subscription.usage_minutes_used || 0)
          );

          // Structure the data with nested limits object
          const structuredData: SubscriptionData = {
            // Nested limits object for compatibility
            limits: {
              minutes_remaining: minutesRemaining,
              subscription_tier: subscription.subscription_tier || 'trial',
              subscription_status: subscription.subscription_status || 'active',
              client_limit: subscription.client_limit || 0
            },
            // Original flat data
            user_id: subscription.user_id,
            subscription_tier: subscription.subscription_tier || 'trial',
            subscription_status: subscription.subscription_status || 'active',
            plan_type: subscription.plan_type || 'recurring',
            trial_ends_at: subscription.trial_ends_at,
            current_period_end: subscription.current_period_end,
            usage_minutes_limit: subscription.usage_minutes_limit || 0,
            usage_minutes_used: subscription.usage_minutes_used || 0,
            client_limit: subscription.client_limit || 0,
            clients_used: subscription.clients_used || 0
          };

          console.log('✅ Subscription loaded');
          setData(structuredData);
        } else {
          // Default subscription data if none exists
          const defaultData: SubscriptionData = {
            limits: {
              minutes_remaining: 45,
              subscription_tier: 'trial',
              subscription_status: 'trialing',
              client_limit: 0
            },
            user_id: userId,
            subscription_tier: 'trial',
            subscription_status: 'trialing',
            plan_type: 'recurring',
            trial_ends_at: null,
            current_period_end: null,
            usage_minutes_limit: 45,
            usage_minutes_used: 0,
            client_limit: 0,
            clients_used: 0
          };

          setData(defaultData);
        }
      } catch (err) {
        console.error('Subscription loading error:', err);
        if (isMounted) {
          setError(err as Error);

          // Return safe defaults on error
          const fallbackData: SubscriptionData = {
            limits: {
              minutes_remaining: 0,
              subscription_tier: 'trial',
              subscription_status: 'error',
              client_limit: 0
            },
            user_id: userId,
            subscription_tier: 'trial',
            subscription_status: 'error',
            plan_type: 'recurring',
            trial_ends_at: null,
            current_period_end: null,
            usage_minutes_limit: 0,
            usage_minutes_used: 0,
            client_limit: 0,
            clients_used: 0
          };

          setData(fallbackData);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadSubscription();

    // Subscribe to realtime updates
    const subscription = supabase
      .channel(`subscription-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('📊 Subscription updated:', payload);
          loadSubscription();
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [userId]);

  return {
    data,
    isLoading,
    error,
    refetch: () => {
      if (userId) {
        setIsLoading(true);
        // Re-trigger effect by updating a dependency
        const loadSubscription = async () => {
          // Same logic as above
          try {
            const { data: subscription } = await supabase
              .from('subscriptions')
              .select('*')
              .eq('user_id', userId)
              .single();

            if (subscription) {
              const minutesRemaining = Math.max(
                0,
                (subscription.usage_minutes_limit || 0) - (subscription.usage_minutes_used || 0)
              );

              const structuredData: SubscriptionData = {
                limits: {
                  minutes_remaining: minutesRemaining,
                  subscription_tier: subscription.subscription_tier || 'trial',
                  subscription_status: subscription.subscription_status || 'active',
                  client_limit: subscription.client_limit || 0
                },
                user_id: subscription.user_id,
                subscription_tier: subscription.subscription_tier || 'trial',
                subscription_status: subscription.subscription_status || 'active',
                plan_type: subscription.plan_type || 'recurring',
                trial_ends_at: subscription.trial_ends_at,
                current_period_end: subscription.current_period_end,
                usage_minutes_limit: subscription.usage_minutes_limit || 0,
                usage_minutes_used: subscription.usage_minutes_used || 0,
                client_limit: subscription.client_limit || 0,
                clients_used: subscription.clients_used || 0
              };

              setData(structuredData);
            }
          } catch (err) {
            console.error('Refetch error:', err);
            setError(err as Error);
          } finally {
            setIsLoading(false);
          }
        };

        loadSubscription();
      }
    }
  };
}