// Location: client/src/hooks/use-subscription.ts
// FIXED VERSION - Uses backend API to properly handle therapist-client relationships

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getApiUrl } from '@/lib/platform';

interface SubscriptionData {
  limits: {
    can_use_voice: boolean;
    minutes_remaining: number;
    minutes_used: number;
    minutes_limit: number;
    subscription_tier: string;
    subscription_status: string;
    client_limit: number;
    is_using_therapist_subscription?: boolean;
    subscription_owner_id?: string;
    subscription_owner_email?: string;
    is_trial?: boolean;
    trial_days_left?: number;
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

        // Get auth token
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (!token) {
          console.warn('⚠️ No auth token available for subscription fetch');
          // Set default trial data instead of throwing
          const defaultData: SubscriptionData = {
            limits: {
              can_use_voice: true,
              minutes_remaining: 45,
              minutes_used: 0,
              minutes_limit: 45,
              subscription_tier: 'trial',
              subscription_status: 'active',
              client_limit: 0,
              is_trial: true,
              trial_days_left: 30
            },
            user_id: userId,
            subscription_tier: 'trial',
            subscription_status: 'active',
            plan_type: 'recurring',
            trial_ends_at: null,
            current_period_end: null,
            usage_minutes_limit: 45,
            usage_minutes_used: 0,
            client_limit: 0,
            clients_used: 0
          };

          if (isMounted) {
            setData(defaultData);
            setIsLoading(false);
          }
          return;
        }

        // Use backend API with getApiUrl for iOS Capacitor support
        const response = await fetch(getApiUrl(`/api/subscription/status/${userId}`), {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });

        if (!response.ok) {
          console.warn(`⚠️ Subscription API returned ${response.status}, using trial defaults`);
          // Use trial defaults instead of throwing
          const defaultData: SubscriptionData = {
            limits: {
              can_use_voice: true,
              minutes_remaining: 45,
              minutes_used: 0,
              minutes_limit: 45,
              subscription_tier: 'trial',
              subscription_status: 'active',
              client_limit: 0,
              is_trial: true,
              trial_days_left: 30
            },
            user_id: userId,
            subscription_tier: 'trial',
            subscription_status: 'active',
            plan_type: 'recurring',
            trial_ends_at: null,
            current_period_end: null,
            usage_minutes_limit: 45,
            usage_minutes_used: 0,
            client_limit: 0,
            clients_used: 0
          };

          if (isMounted) {
            setData(defaultData);
            setIsLoading(false);
          }
          return;
        }

        const apiData = await response.json();

        if (!isMounted) return;

        if (apiData.success && apiData.limits) {
          const structuredData: SubscriptionData = {
            limits: {
              can_use_voice: apiData.limits.can_use_voice ?? true,
              minutes_remaining: apiData.limits.minutes_remaining || 0,
              minutes_used: apiData.limits.minutes_used || 0,
              minutes_limit: apiData.limits.minutes_limit || 0,
              subscription_tier: apiData.limits.subscription_tier || 'trial',
              subscription_status: apiData.subscription?.subscription_status || 'active',
              client_limit: apiData.subscription?.client_limit || 0,
              is_using_therapist_subscription: apiData.limits.is_using_therapist_subscription,
              subscription_owner_id: apiData.limits.subscription_owner_id,
              subscription_owner_email: apiData.limits.subscription_owner_email,
              is_trial: apiData.limits.is_trial,
              trial_days_left: apiData.limits.trial_days_left
            },
            user_id: userId,
            subscription_tier: apiData.limits.subscription_tier || 'trial',
            subscription_status: apiData.subscription?.subscription_status || 'active',
            plan_type: apiData.subscription?.plan_type || 'recurring',
            trial_ends_at: null,
            current_period_end: null,
            usage_minutes_limit: apiData.limits.minutes_limit || 0,
            usage_minutes_used: apiData.limits.minutes_used || 0,
            client_limit: apiData.subscription?.client_limit || 0,
            clients_used: apiData.subscription?.clients_used || 0
          };

          setData(structuredData);
          console.log('✅ Subscription loaded successfully');
        } else {
          // Default subscription data if API returns invalid response
          const defaultData: SubscriptionData = {
            limits: {
              can_use_voice: true,
              minutes_remaining: 45,
              minutes_used: 0,
              minutes_limit: 45,
              subscription_tier: 'trial',
              subscription_status: 'active',
              client_limit: 0,
              is_trial: true,
              trial_days_left: 30
            },
            user_id: userId,
            subscription_tier: 'trial',
            subscription_status: 'active',
            plan_type: 'recurring',
            trial_ends_at: null,
            current_period_end: null,
            usage_minutes_limit: 45,
            usage_minutes_used: 0,
            client_limit: 0,
            clients_used: 0
          };

          console.log('⚠️ Using default subscription data');
          setData(defaultData);
        }
      } catch (err) {
        console.error('❌ Subscription loading error:', err);
        // Don't throw - set error state and use trial defaults
        setError(err as Error);

        // Set trial defaults so app can continue (with voice enabled)
        const defaultData: SubscriptionData = {
          limits: {
            can_use_voice: true,
            minutes_remaining: 45,
            minutes_used: 0,
            minutes_limit: 45,
            subscription_tier: 'trial',
            subscription_status: 'active',
            client_limit: 0,
            is_trial: true,
            trial_days_left: 30
          },
          user_id: userId,
          subscription_tier: 'trial',
          subscription_status: 'active',
          plan_type: 'recurring',
          trial_ends_at: null,
          current_period_end: null,
          usage_minutes_limit: 45,
          usage_minutes_used: 0,
          client_limit: 0,
          clients_used: 0
        };

        if (isMounted) {
          setData(defaultData);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadSubscription();

    // Subscribe to realtime updates on subscriptions table
    // Listen to ALL subscription changes (not filtered by user_id)
    // because clients need to hear about their therapist's subscription updates
    const subscription = supabase
      .channel(`subscription-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions'
          // No filter - we need to catch therapist subscription updates too
        },
        (payload) => {
          console.log('📊 Subscription updated:', payload);
          loadSubscription();
        }
      )
      .subscribe();

    // Also listen to relationship changes
    const relationshipSubscription = supabase
      .channel(`relationships-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'therapist_client_relationships',
          filter: `client_id=eq.${userId}`
        },
        (payload) => {
          console.log('👥 Relationship changed, reloading subscription:', payload);
          loadSubscription();
        }
      )
      .subscribe();

    // Cleanup
    return () => {
      isMounted = false;
      subscription.unsubscribe();
      relationshipSubscription.unsubscribe();
    };
  }, [userId]);

  return {
    data,
    isLoading,
    error,
    refetch: async () => {
      if (userId) {
        setIsLoading(true);

        try {
          // Get auth token
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token;

          if (!token) {
            console.warn('⚠️ No auth token for refetch, using defaults');
            setIsLoading(false);
            return;
          }

          // Use backend API with getApiUrl for iOS Capacitor support
          const response = await fetch(getApiUrl(`/api/subscription/status/${userId}`), {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            credentials: 'include'
          });

          if (!response.ok) {
            console.warn(`⚠️ Refetch returned ${response.status}`);
            setIsLoading(false);
            return;
          }

          const apiData = await response.json();

          if (apiData.success && apiData.limits) {
            const structuredData: SubscriptionData = {
              limits: {
                can_use_voice: apiData.limits.can_use_voice ?? true,
                minutes_remaining: apiData.limits.minutes_remaining || 0,
                minutes_used: apiData.limits.minutes_used || 0,
                minutes_limit: apiData.limits.minutes_limit || 0,
                subscription_tier: apiData.limits.subscription_tier || 'trial',
                subscription_status: apiData.subscription?.subscription_status || 'active',
                client_limit: apiData.subscription?.client_limit || 0,
                is_using_therapist_subscription: apiData.limits.is_using_therapist_subscription,
                subscription_owner_id: apiData.limits.subscription_owner_id,
                subscription_owner_email: apiData.limits.subscription_owner_email,
                is_trial: apiData.limits.is_trial,
                trial_days_left: apiData.limits.trial_days_left
              },
              user_id: userId,
              subscription_tier: apiData.limits.subscription_tier || 'trial',
              subscription_status: apiData.subscription?.subscription_status || 'active',
              plan_type: apiData.subscription?.plan_type || 'recurring',
              trial_ends_at: null,
              current_period_end: null,
              usage_minutes_limit: apiData.limits.minutes_limit || 0,
              usage_minutes_used: apiData.limits.minutes_used || 0,
              client_limit: apiData.subscription?.client_limit || 0,
              clients_used: apiData.subscription?.clients_used || 0
            };

            setData(structuredData);
            console.log('✅ Subscription refetched successfully');
          }
        } catch (err) {
          console.error('Refetch error:', err);
          // Don't break the app on refetch errors
        } finally {
          setIsLoading(false);
        }
      }
    }
  };
}