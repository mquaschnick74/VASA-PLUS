// server/services/subscription-service.ts
import { supabase } from './supabase-service';

// ADD THIS INTERFACE HERE (lines 3-13)
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

export class SubscriptionService {
  async getSubscriptionLimits(userId: string): Promise<SubscriptionLimits> {
    // Check if user is a client with therapist
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profile?.user_type === 'client' && profile.invited_by) {
      // Check for active therapist relationship
      const { data: relationship } = await supabase
        .from('therapist_client_relationships')
        .select('*')
        .eq('client_id', userId)
        .eq('therapist_id', profile.invited_by)
        .eq('status', 'active')
        .single();

      if (relationship) {
        // Use therapist's subscription
        return this.getSubscriptionLimits(profile.invited_by);
      }
    }

    // Get subscriptions (handle multiple)
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    const subscription = subscriptions?.[0];
    
    if (!subscription) {
      await this.createTrialSubscription(userId);
      return this.getSubscriptionLimits(userId);
    }

    const now = new Date();
    const isExpired = subscription.subscription_status === 'expired' ||
      (subscription.trial_ends_at && new Date(subscription.trial_ends_at) < now);

    const minutesRemaining = Math.max(0, (subscription.usage_minutes_limit || 0) - (subscription.usage_minutes_used || 0));

    return {
      can_use_voice: !isExpired && minutesRemaining > 0,
      minutes_remaining: minutesRemaining,
      minutes_used: subscription.usage_minutes_used || 0,
      minutes_limit: subscription.usage_minutes_limit || 0,
      subscription_active: !isExpired,
      is_trial: subscription.subscription_status === 'trialing',
      trial_days_left: subscription.trial_ends_at ? 
        Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0,
      subscription_tier: subscription.subscription_tier,
      user_type: profile?.user_type || 'individual'
    };
  }

  async canStartVoiceSession(userId: string): Promise<boolean> {
    const limits = await this.getSubscriptionLimits(userId);
    return limits.can_use_voice;
  }

  async trackUsageSession(userId: string, minutes: number, sessionId?: string, callId?: string) {
    try {
      console.log(`📊 trackUsageSession called:`, { userId, minutes, sessionId, callId });

      // Get user profile first
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('❌ Failed to get user profile:', profileError);
        throw profileError;
      }

      console.log('👤 User profile found:', profile?.email);

      // Record usage session
      const { data: usageData, error: usageError } = await supabase
        .from('usage_sessions')
        .insert({
          user_id: userId,
          duration_minutes: Math.ceil(minutes),
          therapeutic_session_id: sessionId,
          vapi_call_id: callId
        })
        .select()
        .single();

      if (usageError) {
        console.error('❌ Failed to insert usage session:', usageError);
        throw usageError;
      }

      console.log('✅ Usage session created:', usageData);

      // Update subscription
      // First get current usage
      const { data: currentSub } = await supabase
        .from('subscriptions')
        .select('usage_minutes_used')
        .eq('user_id', userId)
        .single();

      if (currentSub) {
        const newUsage = (currentSub.usage_minutes_used || 0) + Math.ceil(minutes);

        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({ 
            usage_minutes_used: newUsage,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (updateError) {
          console.error('❌ Failed to update subscription:', updateError);
          throw updateError;
        }

        console.log(`✅ Subscription updated for user ${userId}: ${newUsage} minutes used`);
      }

      return true;
      } catch (error) {
        console.error('❌ trackUsageSession failed:', error);
        return false;
      }
      }

  async createTrialSubscription(userId: string) {
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    const { error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        subscription_tier: 'trial',
        subscription_status: 'trialing',
        plan_type: 'recurring',
        trial_ends_at: trialEndDate.toISOString(),
        trial_minutes_limit: 45,
        usage_minutes_limit: 45,
        usage_minutes_used: 0
      });

    if (error) {
      console.error('Error creating trial subscription:', error);
      return false;
    }

    console.log(`✅ Created trial subscription for user ${userId}`);
    return true;
  }

  async getSubscriptionStatus(userId: string) {
    const limits = await this.getSubscriptionLimits(userId);

    return {
      success: true,
      limits,
      subscription: {
        subscription_tier: limits.subscription_tier,
        subscription_status: limits.is_trial ? 'trialing' : 'active',
        usage_minutes_limit: limits.minutes_limit,
        usage_minutes_used: limits.minutes_used
      }
    };
  }
}

export const subscriptionService = new SubscriptionService();