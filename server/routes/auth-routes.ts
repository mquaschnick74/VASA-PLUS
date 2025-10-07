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
    .maybeSingle(); // Use maybeSingle to avoid errors

  if (!profile) {
    // Create user profile
    await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        email,
        full_name: firstName || email.split('@')[0],
        user_type: userType
      }, {
        onConflict: 'id'
      });
  } else if (profile.user_type !== userType && userType !== 'individual') {
    // Only update user_type if it's explicitly set and different
    await supabase
      .from('user_profiles')
      .update({
        user_type: userType,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
  }

  // Check subscriptions
  const { data: existingSubscriptions } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (!existingSubscriptions || existingSubscriptions.length === 0) {
    // Create trial subscription only if none exists
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
    const { email, firstName, authUserId, userType = 'individual', promoCode } = req.body;
    console.log('POST /api/auth/user - Request body:', { email, firstName, authUserId, userType, promoCode });

    if (!email || !authUserId) {
      return res.status(400).json({ error: 'Email and auth ID are required' });
    }

    // Verify the request is from the authenticated user
    if (!req.user || req.user.id !== authUserId) {
      console.error('Auth mismatch - req.user.id:', req.user?.id, 'authUserId:', authUserId);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // First, try to find user by email (most reliable)
    const { data: existingUser, error: selectError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle(); // Use maybeSingle instead of single to avoid errors

    if (selectError) {
      console.error('Error checking existing user:', selectError);
      throw selectError;
    }

    if (existingUser) {
      console.log('Found existing user:', existingUser.email);

      // Update auth_user_id if it's different (handles auth session changes)
      if (existingUser.auth_user_id !== authUserId) {
        console.log('Updating auth_user_id from', existingUser.auth_user_id, 'to', authUserId);
        await supabase
          .from('users')
          .update({ 
            auth_user_id: authUserId,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingUser.id);
      }

      // Update the name if provided and different
      if (firstName && firstName !== existingUser.first_name) {
        await supabase
          .from('users')
          .update({ 
            first_name: firstName,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingUser.id);
      }

      // ADD THIS: Update role if userType is therapist and role is still client
      if (userType === 'therapist' && existingUser.role !== 'therapist') {
        console.log('Updating role from', existingUser.role, 'to therapist');
        await supabase
          .from('users')
          .update({ 
            role: 'therapist',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingUser.id);
      }

      // ============================================================================
      // PROMO CODE TRACKING
      // ============================================================================
      if (promoCode && promoCode.trim().length > 0) {
        const cleanCode = promoCode.trim().toUpperCase();
        
        console.log(`🎟️ Processing promo code: ${cleanCode} for user: ${email}`);

        // Verify promo code is valid
        const { data: influencer } = await supabase
          .from('influencer_profiles')
          .select('id, influencer_name, commission_percentage, influencer_status')
          .eq('unique_promo_code', cleanCode)
          .eq('influencer_status', 'active')
          .single();

        if (influencer) {
          console.log(`✅ Valid promo code from influencer: ${influencer.influencer_name}`);

          // Store promo code in users table
          const { error: updateError } = await supabase
            .from('users')
            .update({ referred_by_promo_code: cleanCode })
            .eq('id', existingUser.id);

          if (updateError) {
            console.error('Failed to save promo code:', updateError);
          }

          // Create initial conversion record (status: pending)
          const { error: conversionError } = await supabase
            .from('influencer_conversions')
            .insert({
              influencer_id: influencer.id,
              converted_user_id: existingUser.id,
              conversion_type: 'trial',
              promo_code_used: cleanCode,
              commission_percentage_applied: influencer.commission_percentage,
              conversion_status: 'pending',
              conversion_date: new Date().toISOString()
            });

          if (conversionError) {
            console.error('Failed to create conversion record:', conversionError);
          } else {
            console.log(`✅ Conversion tracked for influencer ${influencer.influencer_name}`);
          }
        } else {
          console.log(`❌ Invalid or inactive promo code: ${cleanCode}`);
        }
      }
      // ============================================================================
      // END PROMO CODE TRACKING
      // ============================================================================

      // Ensure profile and subscription exist
      await ensureUserSetup(existingUser.id, email, firstName || existingUser.first_name, userType);

      return res.json({ user: existingUser });
    }

    // Only create new user if they truly don't exist
    console.log('Creating new user for:', email);

    // Double-check one more time to prevent race conditions
    const { data: doubleCheck } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (doubleCheck) {
      // User was just created by another request
      
      // PROMO CODE TRACKING
      if (promoCode && promoCode.trim().length > 0) {
        const cleanCode = promoCode.trim().toUpperCase();
        console.log(`🎟️ Processing promo code: ${cleanCode} for user: ${email}`);

        const { data: influencer } = await supabase
          .from('influencer_profiles')
          .select('id, influencer_name, commission_percentage, influencer_status')
          .eq('unique_promo_code', cleanCode)
          .eq('influencer_status', 'active')
          .single();

        if (influencer) {
          console.log(`✅ Valid promo code from influencer: ${influencer.influencer_name}`);

          await supabase
            .from('users')
            .update({ referred_by_promo_code: cleanCode })
            .eq('id', doubleCheck.id);

          await supabase
            .from('influencer_conversions')
            .insert({
              influencer_id: influencer.id,
              converted_user_id: doubleCheck.id,
              conversion_type: 'trial',
              promo_code_used: cleanCode,
              commission_percentage_applied: influencer.commission_percentage,
              conversion_status: 'pending',
              conversion_date: new Date().toISOString()
            });

          console.log(`✅ Conversion tracked for influencer ${influencer.influencer_name}`);
        } else {
          console.log(`❌ Invalid or inactive promo code: ${cleanCode}`);
        }
      }
      
      await ensureUserSetup(doubleCheck.id, email, firstName || doubleCheck.first_name, userType);
      return res.json({ user: doubleCheck });
    }

    // Create new user with proper role
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        first_name: firstName || email.split('@')[0],
        auth_user_id: authUserId,
        role: userType === 'therapist' ? 'therapist' : 'client'  // ADD THIS LINE
      })
      .select()
      .single();

    if (error) {
      // If we get a duplicate key error here, try to fetch the user again
      if (error.code === '23505') {
        console.log('Duplicate key error, fetching existing user');
        const { data: existingAfterError } = await supabase
          .from('users')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (existingAfterError) {
          // PROMO CODE TRACKING
          if (promoCode && promoCode.trim().length > 0) {
            const cleanCode = promoCode.trim().toUpperCase();
            console.log(`🎟️ Processing promo code: ${cleanCode} for user: ${email}`);

            const { data: influencer } = await supabase
              .from('influencer_profiles')
              .select('id, influencer_name, commission_percentage, influencer_status')
              .eq('unique_promo_code', cleanCode)
              .eq('influencer_status', 'active')
              .single();

            if (influencer) {
              console.log(`✅ Valid promo code from influencer: ${influencer.influencer_name}`);

              await supabase
                .from('users')
                .update({ referred_by_promo_code: cleanCode })
                .eq('id', existingAfterError.id);

              await supabase
                .from('influencer_conversions')
                .insert({
                  influencer_id: influencer.id,
                  converted_user_id: existingAfterError.id,
                  conversion_type: 'trial',
                  promo_code_used: cleanCode,
                  commission_percentage_applied: influencer.commission_percentage,
                  conversion_status: 'pending',
                  conversion_date: new Date().toISOString()
                });

              console.log(`✅ Conversion tracked for influencer ${influencer.influencer_name}`);
            } else {
              console.log(`❌ Invalid or inactive promo code: ${cleanCode}`);
            }
          }
          
          await ensureUserSetup(existingAfterError.id, email, firstName || existingAfterError.first_name, userType);
          return res.json({ user: existingAfterError });
        }
      }
      throw error;
    }

    // PROMO CODE TRACKING
    if (promoCode && promoCode.trim().length > 0) {
      const cleanCode = promoCode.trim().toUpperCase();
      console.log(`🎟️ Processing promo code: ${cleanCode} for user: ${email}`);

      const { data: influencer } = await supabase
        .from('influencer_profiles')
        .select('id, influencer_name, commission_percentage, influencer_status')
        .eq('unique_promo_code', cleanCode)
        .eq('influencer_status', 'active')
        .single();

      if (influencer) {
        console.log(`✅ Valid promo code from influencer: ${influencer.influencer_name}`);

        await supabase
          .from('users')
          .update({ referred_by_promo_code: cleanCode })
          .eq('id', newUser.id);

        await supabase
          .from('influencer_conversions')
          .insert({
            influencer_id: influencer.id,
            converted_user_id: newUser.id,
            conversion_type: 'trial',
            promo_code_used: cleanCode,
            commission_percentage_applied: influencer.commission_percentage,
            conversion_status: 'pending',
            conversion_date: new Date().toISOString()
          });

        console.log(`✅ Conversion tracked for influencer ${influencer.influencer_name}`);
      } else {
        console.log(`❌ Invalid or inactive promo code: ${cleanCode}`);
      }
    }

    // Setup profile and subscription for new user
    await ensureUserSetup(newUser.id, email, firstName || email.split('@')[0], userType);

    res.json({ user: newUser });
  } catch (error) {
    console.error('Error in /user endpoint:', error);
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

    // Get user profile for user_type - use users.id
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // Get subscription status - use users.id
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
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

// Accept consent - REQUIRES AUTHENTICATION
router.post('/accept-consent', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify ownership
    if (req.user && user.auth_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Update consent timestamp
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        consent_accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating consent:', updateError);
      throw updateError;
    }

    console.log(`✅ Consent accepted for user ${userId}`);

    res.json({ 
      success: true,
      message: 'Consent recorded successfully'
    });
  } catch (error) {
    console.error('Error recording consent:', error);
    res.status(500).json({ error: 'Failed to record consent' });
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

// ============================================================================
// PROMO CODE VALIDATION
// ============================================================================

// POST /api/auth/validate-promo - Check if promo code is valid
router.post('/validate-promo', async (req, res) => {
  try {
    const { promoCode } = req.body;

    if (!promoCode || promoCode.trim().length === 0) {
      return res.status(400).json({ 
        valid: false,
        error: 'Promo code is required' 
      });
    }

    // Clean and uppercase the promo code
    const cleanCode = promoCode.trim().toUpperCase();

    // Look up influencer by promo code
    const { data: influencer, error } = await supabase
      .from('influencer_profiles')
      .select(`
        id,
        influencer_name,
        platform,
        platform_handle,
        commission_percentage,
        influencer_status,
        unique_promo_code
      `)
      .eq('unique_promo_code', cleanCode)
      .single();

    if (error || !influencer) {
      return res.json({ 
        valid: false,
        error: 'Invalid promo code'
      });
    }

    // Check if influencer is active
    if (influencer.influencer_status !== 'active') {
      return res.json({ 
        valid: false,
        error: 'This promo code is no longer active'
      });
    }

    // Valid promo code
    return res.json({ 
      valid: true,
      influencer: {
        name: influencer.influencer_name,
        handle: influencer.platform_handle,
        platform: influencer.platform,
        discount: influencer.commission_percentage // Could show this as a "discount" to user
      },
      message: `Promo code from ${influencer.influencer_name} applied!`
    });

  } catch (error) {
    console.error('Promo code validation error:', error);
    res.status(500).json({ 
      valid: false,
      error: 'Failed to validate promo code' 
    });
  }
});


export default router;