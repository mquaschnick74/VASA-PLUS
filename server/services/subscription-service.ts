// server/services/subscription-service.ts
import { supabase } from './supabase-service';

// Interface for subscription limits
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
  subscription_owner_id?: string;
  subscription_owner_email?: string;
  is_using_therapist_subscription?: boolean;
  session_duration_limit?: number;
  client_limit?: number;
  clients_used?: number;
  pattern_gate_fired?: boolean;
  pattern_gate_description?: string | null;
}

export class SubscriptionService {
  /**
   * Get subscription limits for a user
   * For clients with therapists, returns the therapist's subscription
   * For therapists and individuals, returns their own subscription
   */
  async getSubscriptionLimits(userId: string, depth: number = 0): Promise<SubscriptionLimits> {
    // Prevent infinite recursion (safety check)
    if (depth > 3) {
      console.error('❌ Subscription lookup recursion limit reached');
      throw new Error('Subscription lookup failed: recursion limit');
    }

    console.log(`🔍 [Depth ${depth}] Getting subscription limits for user: ${userId}`);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error(`❌ [Depth ${depth}] Failed to get user profile:`, profileError);
      throw new Error('User profile not found');
    }

    console.log(`👤 [Depth ${depth}] User type: ${profile.user_type}, Email: ${profile.email}`);

    // CASE 1: Client with therapist - use therapist's subscription
    if (profile.user_type === 'client' && profile.invited_by) {
      console.log(`🔗 [Depth ${depth}] Client connected to therapist: ${profile.invited_by}`);

      // Check for active therapist relationship
      const { data: relationship, error: relError } = await supabase
        .from('therapist_client_relationships')
        .select('*')
        .eq('client_id', userId)
        .eq('therapist_id', profile.invited_by)
        .eq('status', 'active')
        .single();

      if (relError) {
        console.warn(`⚠️ [Depth ${depth}] No active relationship found:`, relError.message);
      } else if (relationship) {
        console.log(`✅ [Depth ${depth}] Active relationship found, using therapist's subscription`);
        const therapistLimits = await this.getSubscriptionLimits(profile.invited_by, depth + 1);

        // ADD THIS: Include the client's specific session duration limit
        return {
          ...therapistLimits,
          is_using_therapist_subscription: true,
          user_type: 'client',
          session_duration_limit: relationship.session_duration_limit || 900 // ADD THIS LINE
        };
      }
    }

    // CASE 2: Therapist or individual - use their own subscription
    console.log(`📊 [Depth ${depth}] Fetching direct subscription for user`);

    // Get subscriptions (handle multiple)
    const { data: subscriptions, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (subError) {
      console.error(`❌ [Depth ${depth}] Error fetching subscriptions:`, subError);
    }

    const subscription = subscriptions?.[0];

    // CASE 3: No subscription exists - create trial
    if (!subscription) {
      console.log(`🆕 [Depth ${depth}] No subscription found, creating trial`);
      const created = await this.createTrialSubscription(userId);

      if (created) {
        // Recursively call to get the newly created subscription
        return this.getSubscriptionLimits(userId, depth + 1);
      } else {
        // If creation failed, return a locked-out state
        console.error(`❌ [Depth ${depth}] Failed to create trial subscription`);
        return {
          can_use_voice: false,
          minutes_remaining: 0,
          minutes_used: 0,
          minutes_limit: 0,
          subscription_active: false,
          is_trial: false,
          trial_days_left: 0,
          subscription_tier: 'none',
          user_type: profile.user_type || 'individual',
          subscription_owner_id: userId,
          subscription_owner_email: profile.email
        };
      }
    }

    // CASE 4: Subscription exists - calculate limits
    console.log(`💳 [Depth ${depth}] Subscription found:`, {
      tier: subscription.subscription_tier,
      status: subscription.subscription_status,
      minutes_limit: subscription.usage_minutes_limit,
      minutes_used: subscription.usage_minutes_used
    });

    const now = new Date();
    const isPatternGated = subscription.subscription_status === 'pattern_gated';
    const isExpired = subscription.subscription_status === 'expired' ||
      (subscription.trial_ends_at && new Date(subscription.trial_ends_at) < now);

    const minutesRemaining = Math.max(0, (subscription.usage_minutes_limit || 0) - (subscription.usage_minutes_used || 0));

    const limits: SubscriptionLimits = {
      can_use_voice: !isExpired && !isPatternGated && minutesRemaining > 0,
      minutes_remaining: minutesRemaining,
      minutes_used: subscription.usage_minutes_used || 0,
      minutes_limit: subscription.usage_minutes_limit || 0,
      subscription_active: !isExpired && !isPatternGated,
      is_trial: subscription.subscription_status === 'trialing',
      trial_days_left: subscription.trial_ends_at ?
        Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0,
      subscription_tier: subscription.subscription_tier,
      user_type: profile.user_type || 'individual',
      subscription_owner_id: userId,
      subscription_owner_email: profile.email,
      client_limit: subscription.client_limit || 0,
      clients_used: subscription.clients_used || 0,
      pattern_gate_fired: subscription.pattern_gate_fired || false,
      pattern_gate_description: subscription.pattern_gate_description || null,
    };

    console.log(`✅ [Depth ${depth}] Limits calculated:`, {
      can_use_voice: limits.can_use_voice,
      minutes_remaining: limits.minutes_remaining
    });

    return limits;
  }

  async canStartVoiceSession(userId: string): Promise<boolean> {
    const limits = await this.getSubscriptionLimits(userId);
    return limits.can_use_voice;
  }

  /**
   * Track usage session and update the CORRECT subscription
   * For clients, this should update their therapist's subscription
   * For therapists/individuals, this updates their own subscription
   */
  async trackUsageSession(userId: string, minutes: number, sessionId?: string, callId?: string) {
    try {
      console.log(`📊 trackUsageSession called:`, { userId, minutes, sessionId, callId });

      // Get the subscription info (this will follow the client->therapist chain)
      const limits = await this.getSubscriptionLimits(userId);

      // Determine whose subscription to update
      const subscriptionOwnerId = limits.subscription_owner_id || userId;

      console.log(`🎯 Tracking usage against subscription owner: ${subscriptionOwnerId}`);
      if (limits.is_using_therapist_subscription) {
        console.log(`   (Client ${userId} is using therapist's subscription)`);
      }

      // Get user profile to log who made the call
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('❌ Failed to get user profile:', profileError);
        throw profileError;
      }

      console.log('👤 Call made by:', profile?.email);

      // Record usage session (always record against the user who made the call)
      const { data: usageData, error: usageError } = await supabase
        .from('usage_sessions')
        .insert({
          user_id: userId, // The actual user who made the call
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

      console.log('✅ Usage session recorded:', usageData);

      // Update subscription (use the subscription owner's ID, NOT the caller's ID)
      const { data: currentSub, error: fetchError } = await supabase
        .from('subscriptions')
        .select('usage_minutes_used')
        .eq('user_id', subscriptionOwnerId)
        .single();

      if (fetchError) {
        console.error('❌ Failed to fetch subscription for update:', fetchError);
        throw fetchError;
      }

      if (currentSub) {
        const newUsage = (currentSub.usage_minutes_used || 0) + Math.ceil(minutes);

        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({ 
            usage_minutes_used: newUsage,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', subscriptionOwnerId);

        if (updateError) {
          console.error('❌ Failed to update subscription:', updateError);
          throw updateError;
        }

        console.log(`✅ Subscription updated for ${subscriptionOwnerId}: ${newUsage} minutes used`);
      }

      return true;
    } catch (error) {
      console.error('❌ trackUsageSession failed:', error);
      return false;
    }
  }

  async createTrialSubscription(userId: string): Promise<boolean> {
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 30);

    console.log(`🆕 Creating trial subscription for user: ${userId}`);

    const { error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        subscription_tier: 'trial',
        subscription_status: 'trialing',
        plan_type: 'recurring',
        trial_ends_at: trialEndDate.toISOString(),
        trial_minutes_limit: 180,
        usage_minutes_limit: 180,
        usage_minutes_used: 0
      });

    if (error) {
      console.error('❌ Error creating trial subscription:', error);
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
        subscription_status: limits.pattern_gate_fired ? 'pattern_gated' : (limits.is_trial ? 'trialing' : 'active'),
        usage_minutes_limit: limits.minutes_limit,
        usage_minutes_used: limits.minutes_used,
        client_limit: limits.client_limit || 0,
        clients_used: limits.clients_used || 0
      }
    };
  }

  /**
   * Fire the pattern gate for a user.
   * Idempotent: if already fired, this is a no-op.
   * Requires: userExplicitlyIdentified === true on a structuredPatterns entry
   *           AND the user has completed at least 2 prior therapeutic sessions.
   */
  async firePatternGate(userId: string, patternDescription: string): Promise<boolean> {
    try {
      console.log(`🚪 [PATTERN GATE] Checking gate conditions for user: ${userId}`);

      // Check if gate already fired (idempotent)
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('pattern_gate_fired, subscription_status')
        .eq('user_id', userId)
        .single();

      if (!subscription) {
        console.warn(`⚠️ [PATTERN GATE] No subscription found for user: ${userId}`);
        return false;
      }

      if (subscription.pattern_gate_fired) {
        console.log(`🚪 [PATTERN GATE] Gate already fired for user: ${userId}, skipping`);
        return true;
      }

      // Do not gate paying subscribers
      if (['active', 'past_due'].includes(subscription.subscription_status)) {
        console.log(`🚪 [PATTERN GATE] User ${userId} is a paying subscriber (${subscription.subscription_status}), skipping gate`);
        return false;
      }

      // Check completed session count (at least 2 prior sessions)
      const { count: sessionCount, error: countError } = await supabase
        .from('therapeutic_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('end_time', 'is', null);

      if (countError) {
        console.error(`❌ [PATTERN GATE] Error counting sessions:`, countError);
        return false;
      }

      if ((sessionCount || 0) < 2) {
        console.log(`🚪 [PATTERN GATE] User ${userId} has only ${sessionCount} completed sessions, need at least 2`);
        return false;
      }

      // Fire the gate
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          subscription_status: 'pattern_gated',
          pattern_gate_fired: true,
          pattern_gate_description: patternDescription,
          pattern_gate_fired_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error(`❌ [PATTERN GATE] Failed to fire gate:`, updateError);
        return false;
      }

      console.log(`🚪 [PATTERN GATE] Gate fired for user ${userId}: "${patternDescription}"`);
      return true;
    } catch (error) {
      console.error(`❌ [PATTERN GATE] Unexpected error:`, error);
      return false;
    }
  }
}

export const subscriptionService = new SubscriptionService();