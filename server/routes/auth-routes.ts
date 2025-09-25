// Location: server/routes/auth-routes.ts

import { Router } from 'express';
import { supabase } from '../services/supabase-service';
import { buildMemoryContext, buildMemoryContextWithSummary, buildUserDisplayContext } from '../services/memory-service';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Helper function to ensure user has profile and subscription
async function ensureUserSetup(userId: string, email: string, firstName?: string, userType: string = 'individual') {
  // Check for user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (!profile) {
    // Create user profile
    await supabase
      .from('user_profiles')
      .insert({
        id: userId,
        email,
        full_name: firstName || email.split('@')[0],
        user_type: userType
      });
  }

  // Check for subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!subscription) {
    // Create trial subscription
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    await supabase
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
  }
}

// Create or get user - REQUIRES AUTHENTICATION
router.post('/user', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { email, authUserId } = req.body;
    
    // Use authUserId as the profile ID
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', authUserId)  // <-- Use auth ID as profile ID
      .single();

    if (existingProfile) {
      return res.json({ user: existingProfile });
    }

    // Create new profile with auth user's ID
    const { data: newProfile } = await supabase
      .from('user_profiles')
      .insert({
        id: authUserId,  // <-- Use auth ID as profile ID
        email,
        full_name: req.body.firstName || email.split('@')[0]
      })
      .select()
      .single();
      
    return res.json({ user: newProfile });
  } catch (error) {
    console.error('Error in /user-with-auth:', error);
    res.status(500).json({ error: 'Failed to process user' });
  }
});

// Get user context - REQUIRES AUTHENTICATION
router.get('/user-context/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    const useEnhanced = req.query.enhanced !== 'false';

    // Fetch user profile
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify access
    if (req.user && user.auth_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get user profile for user_type
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.auth_user_id || userId)
      .single();

    // Get subscription status
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.auth_user_id || userId)
      .single();

    // Build memory context for AI agents
    let memoryContext: string;
    let displayMemoryContext: string;  // NEW: Cleaner version for UI display
    let lastSessionSummary: string | null = null;
    let shouldReferenceLastSession: boolean = false;

    if (useEnhanced) {
      try {
        const enhanced = await buildMemoryContextWithSummary(userId);
        memoryContext = enhanced.memoryContext;
        lastSessionSummary = enhanced.lastSessionSummary;
        shouldReferenceLastSession = enhanced.shouldReferenceLastSession;
      } catch (error) {
        memoryContext = await buildMemoryContext(userId);
      }
    } else {
      memoryContext = await buildMemoryContext(userId);
    }

    // NEW: Build simplified memory context for UI display
    const userDisplayInsights = await buildUserDisplayContext(userId);

    // Format display memory context with just the key insights
    displayMemoryContext = userDisplayInsights.length > 0 
      ? userDisplayInsights.join('\n\n')
      : 'Starting your therapeutic journey';

    // Fetch recent sessions
    const { data: sessions } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      success: true,
      profile: user,
      userProfile: profile, // Include user profile with user_type
      subscription, // Include subscription data
      memoryContext,  // Full context for AI agents
      displayMemoryContext,  // NEW: Clean context for UI display
      lastSessionSummary,
      shouldReferenceLastSession,
      sessions: sessions || [],
      firstName: user.first_name || 'there',
      sessionCount: sessions?.length || 0
    });
  } catch (error) {
    console.error('Error fetching user context:', error);
    res.status(500).json({ error: 'Failed to fetch user context' });
  }
});

// Delete user - REQUIRES AUTHENTICATION
router.delete('/user/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    // Verify user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify ownership
    if (req.user && user.auth_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete user (CASCADE handles related data)
    await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    res.json({
      success: true,
      message: 'User and all related data deleted'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;