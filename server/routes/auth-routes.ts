// Location: server/routes/auth-routes.ts

import { Router } from 'express';
import { supabase } from '../services/supabase-service';
import { buildMemoryContext, buildMemoryContextWithSummary, buildUserDisplayContext } from '../services/memory-service';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Helper function to ensure user has profile and subscription
async function ensureUserSetup(userId: string, email: string, firstName?: string, userType: string = 'individual', promoCode?: string) {
  // Check for user profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle(); // Use maybeSingle to avoid errors

  if (!profile) {
    // Create user profile
    // Calculate promo expiry (7 days from signup)
    let promoData = {};
    if (promoCode) {
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 7);
      promoData = {
        promo_code: promoCode,
        promo_discount_expires_at: trialEndDate.toISOString()
      };
    }

    await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        email,
        full_name: firstName || email.split('@')[0],
        user_type: userType,
        ...promoData
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

      // ============================================================================
      // CHECK IF USER IS AN INFLUENCER OR PARTNER - PROTECT THEIR TYPE
      // ============================================================================
      
      // Check if user has influencer access
      const { data: influencerAccess } = await supabase
        .from('influencer_users')
        .select('access_status')
        .eq('user_id', existingUser.id)
        .eq('access_status', 'active')
        .maybeSingle();

      // Check if user has partner access
      const { data: partnerAccess } = await supabase
        .from('partner_users')
        .select('access_level')
        .eq('user_id', existingUser.id)
        .maybeSingle();

      // Override userType if user has special access (don't trust frontend)
      let effectiveUserType = userType;
      
      if (influencerAccess) {
        effectiveUserType = 'influencer';
        console.log('🔒 User has influencer access - protecting type as influencer');
      } else if (partnerAccess) {
        effectiveUserType = 'partner';
        console.log('🔒 User has partner access - protecting type as partner');
      }

      // ============================================================================
      // END PROTECTION CHECK
      // ============================================================================

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
          .maybeSingle();

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
              conversion_status: 'active',
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
      await ensureUserSetup(existingUser.id, email, firstName || existingUser.first_name, userType, promoCode);

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
          .maybeSingle();

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
              conversion_status: 'active',
              conversion_date: new Date().toISOString()
            });

          console.log(`✅ Conversion tracked for influencer ${influencer.influencer_name}`);
        } else {
          console.log(`❌ Invalid or inactive promo code: ${cleanCode}`);
        }
      }
      
      await ensureUserSetup(existingUser.id, email, firstName || existingUser.first_name, userType, promoCode);
      return res.json({ user: doubleCheck });
    }

    // Create new user with proper role
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        email,
        first_name: firstName || email.split('@')[0],
        auth_user_id: authUserId,
        role: userType === 'therapist' ? 'therapist' : 'client',
        referred_by_promo_code: promoCode || null  // ✅ ADD THIS LINE
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
              .maybeSingle();

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
                  conversion_status: 'active',
                  conversion_date: new Date().toISOString()
                });

              console.log(`✅ Conversion tracked for influencer ${influencer.influencer_name}`);
            } else {
              console.log(`❌ Invalid or inactive promo code: ${cleanCode}`);
            }
          }
          
          await ensureUserSetup(existingUser.id, email, firstName || existingUser.first_name, userType, promoCode);
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
        .maybeSingle();

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
            conversion_status: 'active',
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

    // Get session duration limit if client has therapist
    let sessionDurationLimit = 7200; // Default 2 hours for individuals

    if (profile?.user_type === 'client' && profile?.invited_by) {
      const { data: relationship } = await supabase
        .from('therapist_client_relationships')
        .select('session_duration_limit')
        .eq('client_id', userId)
        .eq('therapist_id', profile.invited_by)
        .eq('status', 'active')
        .single();

      if (relationship?.session_duration_limit) {
        sessionDurationLimit = relationship.session_duration_limit;
      }
    }

    // Fetch most recent onboarding response
    const { data: onboardingData } = await supabase
      .from('user_onboarding_responses')
      .select('voice_response, journey_response, created_at, was_skipped')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({
      success: true,
      profile: user,
      userProfile: profile,
      subscription,
      memoryContext,
      displayMemoryContext,
      lastSessionSummary,
      shouldReferenceLastSession,
      sessions: sessions || [],
      firstName: user.first_name || 'there',
      sessionCount: sessions?.length || 0,
      sessionDurationLimit,
      onboarding: onboardingData ? {
        voice: onboardingData.voice_response || '',
        journey: onboardingData.journey_response || '',
        completedAt: onboardingData.created_at,
        wasSkipped: onboardingData.was_skipped
      } : null
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

// Complete onboarding - REQUIRES AUTHENTICATION
router.post('/complete-onboarding', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId, voiceResponse = '', journeyResponse = '', wasSkipped = false } = req.body;

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

    // Insert onboarding response (allows empty values)
    const { data: onboardingData, error: insertError } = await supabase
      .from('user_onboarding_responses')
      .insert({
        user_id: userId,
        voice_response: voiceResponse,
        journey_response: journeyResponse,
        was_skipped: wasSkipped,
        session_number: 1
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting onboarding response:', insertError);
      throw insertError;
    }

    // Update user profile timestamp
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        last_onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating onboarding timestamp:', updateError);
      throw updateError;
    }

    console.log(`✅ Onboarding completed for user ${userId} (skipped: ${wasSkipped})`);

    res.json({
      success: true,
      message: 'Onboarding completed successfully',
      onboardingId: onboardingData.id
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
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