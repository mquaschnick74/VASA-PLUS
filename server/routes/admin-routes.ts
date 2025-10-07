// Location: server/routes/admin-routes.ts
// Admin API endpoints for managing partners and influencers

import { Router } from 'express';
import { requireAdmin, AdminRequest } from '../middleware/admin-auth';
import { supabase } from '../services/supabase-service';

const router = Router();

// All routes require admin authentication
router.use(requireAdmin);

// ============================================================================
// OVERVIEW / STATS
// ============================================================================

router.get('/overview', async (req, res) => {
  try {
    // Get counts and basic stats
    const [
      partnersResult,
      influencersResult,
      usersResult,
      sessionsResult
    ] = await Promise.all([
      supabase.from('partner_organizations').select('*', { count: 'exact' }),
      supabase.from('influencer_profiles').select('*', { count: 'exact' }),
      supabase.from('users').select('*', { count: 'exact' }),
      supabase.from('therapeutic_sessions').select('duration_seconds', { count: 'exact' })
    ]);

    const totalMinutes = sessionsResult.data?.reduce(
      (sum, s) => sum + Math.ceil((s.duration_seconds || 0) / 60), 
      0
    ) || 0;

    res.json({
      partners: {
        total: partnersResult.count || 0,
        active: partnersResult.data?.filter(p => p.status === 'active').length || 0
      },
      influencers: {
        total: influencersResult.count || 0,
        active: influencersResult.data?.filter(i => i.influencer_status === 'active').length || 0
      },
      users: {
        total: usersResult.count || 0
      },
      sessions: {
        total: sessionsResult.count || 0,
        totalMinutes
      }
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

// ============================================================================
// PARTNERS MANAGEMENT
// ============================================================================

router.get('/partners', async (req, res) => {
  try {
    const { data: partners, error } = await supabase
      .from('partner_organizations')
      .select(`
        *,
        partner_users!partner_users_partner_id_fkey(
          user_id,
          users!partner_users_user_id_fkey(
            email,
            first_name
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ partners: partners || [] });
  } catch (error) {
    console.error('Admin partners list error:', error);
    res.status(500).json({ error: 'Failed to load partners' });
  }
});

router.post('/partners/onboard', async (req, res) => {
  try {
    const {
      userEmail,
      organizationName,
      organizationType,
      contactEmail,
      contactPhone,
      modelType,
      revenueSharePercentage,
      equityPercentage
    } = req.body;

    // Validate required fields
    if (!userEmail || !organizationName || !organizationType || !modelType) {
      return res.status(400).json({ 
        error: 'Missing required fields: userEmail, organizationName, organizationType, modelType' 
      });
    }

    // Find or create user
    let userId: string;
    const { data: existingUser } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new user - they'll need to sign up separately
      return res.status(400).json({ 
        error: 'User must sign up first before being onboarded as partner' 
      });
    }

    // Generate API key
    const apiKey = `pk_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;

    // Create partner organization
    const { data: partner, error: partnerError } = await supabase
      .from('partner_organizations')
      .insert({
        organization_name: organizationName,
        organization_type: organizationType,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        api_key: apiKey,
        status: 'prospect',
        model_type: modelType,
        revenue_share_percentage: revenueSharePercentage || 0,
        equity_percentage: equityPercentage || 0
      })
      .select()
      .single();

    if (partnerError) throw partnerError;

    // Link user to partner organization
    const { error: userError } = await supabase
      .from('partner_users')
      .insert({
        partner_id: partner.id,
        user_id: userId,
        access_level: 'admin'
      });

    if (userError) throw userError;

    // Update user type
    await supabase
      .from('user_profiles')
      .update({ user_type: 'partner' })
      .eq('id', userId);

    res.json({ 
      success: true, 
      partner,
      message: 'Partner onboarded successfully'
    });
  } catch (error) {
    console.error('Partner onboarding error:', error);
    res.status(500).json({ error: 'Failed to onboard partner' });
  }
});

// ============================================================================
// INFLUENCERS MANAGEMENT
// ============================================================================

router.get('/influencers', async (req, res) => {
  try {
    const { data: influencers, error } = await supabase
      .from('influencer_profiles')
      .select(`
        *,
        users!influencer_profiles_user_id_fkey(
          email,
          first_name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ influencers: influencers || [] });
  } catch (error) {
    console.error('Admin influencers list error:', error);
    res.status(500).json({ error: 'Failed to load influencers' });
  }
});

router.post('/influencers/onboard', async (req, res) => {
  try {
    const {
      userEmail,
      influencerName,
      platform,
      platformHandle,
      platformUrl,
      followerCount,
      niche,
      tier,
      commissionPercentage,
      equityPercentage
    } = req.body;

    // Validate required fields
    if (!userEmail || !influencerName || !platform || !platformHandle) {
      return res.status(400).json({ 
        error: 'Missing required fields: userEmail, influencerName, platform, platformHandle' 
      });
    }

    // Find user
    const { data: user } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (!user) {
      return res.status(400).json({ 
        error: 'User must sign up first before being onboarded as influencer' 
      });
    }

    // Generate promo code and referral link
    const promoCode = `${platformHandle.replace('@', '').toUpperCase().substring(0, 10)}${commissionPercentage || 15}`;
    const referralLink = `https://ivasa.ai/signup?ref=${promoCode.toLowerCase()}`;
    const utmCampaign = `${platformHandle.replace('@', '')}_${platform}`;

    // Create influencer profile
    const { data: influencer, error: influencerError } = await supabase
      .from('influencer_profiles')
      .insert({
        user_id: user.id,
        influencer_name: influencerName,
        platform: platform,
        platform_handle: platformHandle,
        platform_url: platformUrl,
        follower_count: followerCount || 0,
        niche: niche,
        influencer_status: 'active',
        influencer_tier: tier || 'nano',
        commission_percentage: commissionPercentage || 15,
        equity_percentage: equityPercentage || 0,
        unique_promo_code: promoCode,
        referral_link: referralLink,
        utm_campaign: utmCampaign,
        active_since: new Date().toISOString()
      })
      .select()
      .single();

    if (influencerError) throw influencerError;

    // Grant portal access
    const { error: accessError } = await supabase
      .from('influencer_users')
      .insert({
        influencer_id: influencer.id,
        user_id: user.id,
        access_status: 'active'
      });

    if (accessError) throw accessError;

    // Update user type
    await supabase
      .from('user_profiles')
      .update({ user_type: 'influencer' })
      .eq('id', user.id);

    res.json({ 
      success: true, 
      influencer,
      message: 'Influencer onboarded successfully'
    });
  } catch (error) {
    console.error('Influencer onboarding error:', error);
    res.status(500).json({ error: 'Failed to onboard influencer' });
  }
});

// ============================================================================
// CONTENT MANAGEMENT
// ============================================================================

router.get('/content/pending', async (req, res) => {
  try {
    const { data: content, error } = await supabase
      .from('influencer_content_tracking')
      .select(`
        *,
        influencer_profiles!influencer_content_tracking_influencer_id_fkey(
          influencer_name,
          platform,
          platform_handle
        )
      `)
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ content: content || [] });
  } catch (error) {
    console.error('Admin content list error:', error);
    res.status(500).json({ error: 'Failed to load pending content' });
  }
});

router.post('/content/:contentId/approve', async (req: AdminRequest, res) => {
  try {
    const { contentId } = req.params;
    const adminUserId = req.userId;

    const { error } = await supabase
      .from('influencer_content_tracking')
      .update({
        approval_status: 'approved',
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', contentId);

    if (error) throw error;

    res.json({ success: true, message: 'Content approved' });
  } catch (error) {
    console.error('Content approval error:', error);
    res.status(500).json({ error: 'Failed to approve content' });
  }
});

router.post('/content/:contentId/reject', async (req: AdminRequest, res) => {
  try {
    const { contentId } = req.params;
    const { reason } = req.body;
    const adminUserId = req.userId;

    const { error } = await supabase
      .from('influencer_content_tracking')
      .update({
        approval_status: 'rejected',
        rejection_reason: reason,
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', contentId);

    if (error) throw error;

    res.json({ success: true, message: 'Content rejected' });
  } catch (error) {
    console.error('Content rejection error:', error);
    res.status(500).json({ error: 'Failed to reject content' });
  }
});

// ============================================================================
// VIEW-AS FUNCTIONALITY
// ============================================================================

router.get('/view-as/partner/:partnerId', async (req: AdminRequest, res) => {
  try {
    const { partnerId } = req.params;

    // Get partner organization details
    const { data: partner, error } = await supabase
      .from('partner_organizations')
      .select('*')
      .eq('id', partnerId)
      .single();

    if (error || !partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    // Get first partner user for this organization
    const { data: partnerUser } = await supabase
      .from('partner_users')
      .select('user_id')
      .eq('partner_id', partnerId)
      .limit(1)
      .single();

    if (!partnerUser) {
      return res.status(404).json({ error: 'No user associated with this partner' });
    }

    res.json({ 
      userId: partnerUser.user_id,
      userType: 'partner',
      viewAsName: partner.organization_name
    });
  } catch (error) {
    console.error('View-as partner error:', error);
    res.status(500).json({ error: 'Failed to get partner view' });
  }
});

router.get('/view-as/influencer/:influencerId', async (req: AdminRequest, res) => {
  try {
    const { influencerId } = req.params;

    // Get influencer details
    const { data: influencer, error } = await supabase
      .from('influencer_profiles')
      .select('*')
      .eq('id', influencerId)
      .single();

    if (error || !influencer) {
      return res.status(404).json({ error: 'Influencer not found' });
    }

    res.json({ 
      userId: influencer.user_id,
      userType: 'influencer',
      viewAsName: influencer.influencer_name
    });
  } catch (error) {
    console.error('View-as influencer error:', error);
    res.status(500).json({ error: 'Failed to get influencer view' });
  }
});

export default router;