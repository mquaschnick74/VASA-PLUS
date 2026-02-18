// Location: server/routes/subscription-routes.ts
import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { subscriptionService } from '../services/subscription-service';
import { supabase } from '../services/supabase-service';

const router = Router();

// NEW ROUTE: Get subscription status and limits for a user (handles therapist-client relationships)
router.get('/status/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { userId: requestedUserId } = req.params;
    const authUserId = req.internalUserId;
    const authUserType = req.internalUserType;

    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let canAccess = requestedUserId === authUserId || authUserType === 'admin';
    if (!canAccess && authUserType === 'therapist') {
      const { data: relationship } = await supabase
        .from('therapist_client_relationships')
        .select('id')
        .eq('therapist_id', authUserId)
        .eq('client_id', requestedUserId)
        .eq('status', 'active')
        .maybeSingle();
      canAccess = !!relationship;
    }

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log('📊 Subscription status request:', {
      reqUserId: authUserId,
      paramUserId: requestedUserId,
      match: authUserId === requestedUserId
    });

    // Get subscription status using the service (which handles therapist-client relationships)
    const status = await subscriptionService.getSubscriptionStatus(requestedUserId);

    console.log('✅ Subscription status response:', JSON.stringify(status, null, 2));

    res.json(status);
  } catch (error) {
    console.error('❌ Error fetching subscription status:', error);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

// EXISTING ROUTE: Get subscription limits (kept for backward compatibility)
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

// Check if user can start a voice session
router.get('/can-start-session/:userId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    // Verify the request is for the authenticated user
    if (req.internalUserId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const canStart = await subscriptionService.canStartVoiceSession(userId);
    const limits = await subscriptionService.getSubscriptionLimits(userId);

    res.json({
      canStart,
      limits
    });
  } catch (error) {
    console.error('Error checking voice session permission:', error);
    res.status(500).json({ error: 'Failed to check session permission' });
  }
});

// Track usage (backup endpoint if webhook fails)
router.post('/track-usage', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { userId, duration, sessionId, callId } = req.body;

    // Verify the request is for the authenticated user
    if (req.internalUserId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const durationMinutes = Math.ceil(duration / 60);
    const tracked = await subscriptionService.trackUsageSession(
      userId,
      durationMinutes,
      sessionId,
      callId
    );

    res.json({ success: tracked });
  } catch (error) {
    console.error('Error tracking usage:', error);
    res.status(500).json({ error: 'Failed to track usage' });
  }
});

export default router;
