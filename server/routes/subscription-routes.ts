// Location: server/routes/subscription-routes.ts
// Returns FLAT structure - the hook will nest it under 'limits'

import { Router } from 'express';
import { supabase } from '../services/supabase-service';

const router = Router();

// GET /api/subscription/limits
router.get('/limits', async (req, res) => {
  try {
    const { userId } = req.query;

    console.log('Subscription limits requested for:', userId);

    if (!userId) {
      // Return flat structure (hook will nest it)
      return res.json({
        can_use_voice: true,
        minutes_remaining: 45,
        minutes_used: 0,
        minutes_limit: 45,
        subscription_active: true,
        is_trial: true,
        trial_days_left: 30,
        subscription_tier: 'trial',
        user_type: 'individual'
      });
    }

    // Check for subscription
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !subscription) {
      console.log('No subscription found, returning trial defaults');
      // Return flat structure
      return res.json({
        can_use_voice: true,
        minutes_remaining: 45,
        minutes_used: 0,
        minutes_limit: 45,
        subscription_active: true,
        is_trial: true,
        trial_days_left: 30,
        subscription_tier: 'trial',
        user_type: 'individual'
      });
    }

    const now = new Date();
    const trialEnds = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
    const trialDaysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : 0;
    const minutesRemaining = Math.max(0, (subscription.usage_minutes_limit || 45) - (subscription.usage_minutes_used || 0));

    // Return flat structure - the hook wraps it in { limits: ... }
    res.json({
      can_use_voice: minutesRemaining > 0,
      minutes_remaining: minutesRemaining,
      minutes_used: subscription.usage_minutes_used || 0,
      minutes_limit: subscription.usage_minutes_limit || 45,
      subscription_active: subscription.subscription_status === 'active' || subscription.subscription_status === 'trialing',
      is_trial: subscription.subscription_status === 'trialing',
      trial_days_left: trialDaysLeft,
      subscription_tier: subscription.subscription_tier || 'trial',
      user_type: 'individual'
    });

  } catch (error) {
    console.error('Subscription limits error:', error);
    // Return defaults on error
    res.json({
      can_use_voice: true,
      minutes_remaining: 45,
      minutes_used: 0,
      minutes_limit: 45,
      subscription_active: true,
      is_trial: true,
      trial_days_left: 30,
      subscription_tier: 'trial',
      user_type: 'individual'
    });
  }
});

export default router;