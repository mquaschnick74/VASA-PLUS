// Location: server/routes/influencer-routes.ts
// This file handles all influencer-related API endpoints for commission tracking and analytics

import { Router } from 'express';
import { supabase } from '../services/supabase-service';
import { authenticateToken, AuthRequest } from '../middleware/auth';

// Extend AuthRequest to include influencer properties
interface InfluencerAuthRequest extends AuthRequest {
  influencerId?: string;
  influencerUser?: any;
}

const router = Router();

// ============================================================================
// INFLUENCER AUTHENTICATION & ACCESS CONTROL
// ============================================================================

// Middleware to check if user has influencer access
async function checkInfluencerAccess(req: InfluencerAuthRequest, res: any, next: any) {
  try {
    const authUserId = req.user?.id;

    console.log('🔍 [INFLUENCER ACCESS] Auth user ID:', authUserId);

    if (!authUserId) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    // Get the app user ID from the users table (different from auth user ID)
    const { data: appUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single();

    const userId = appUser?.id;

    console.log('🔍 [INFLUENCER ACCESS] App user ID:', userId);

    if (!userId) {
      return res.status(403).json({ error: 'User not found in app database' });
    }

    // Check if user is an influencer user
    const { data: influencerUser, error } = await supabase
      .from('influencer_users')
      .select(`
        *,
        influencer:influencer_profiles(*)
      `)
      .eq('user_id', userId)
      .eq('access_status', 'active')
      .single();

    console.log('🔍 [INFLUENCER ACCESS] Query result:', { influencerUser, error });

    if (error || !influencerUser) {
      console.log('❌ [INFLUENCER ACCESS] Access denied:', error?.message || 'No influencer user found');
      return res.status(403).json({ error: 'No influencer access' });
    }

    // Attach influencer info to request
    req.influencerUser = influencerUser;
    req.influencerId = influencerUser.influencer_id;

    next();
  } catch (error) {
    console.error('Influencer access check error:', error);
    res.status(500).json({ error: 'Failed to verify influencer access' });
  }
}

// ============================================================================
// DASHBOARD OVERVIEW ENDPOINTS
// ============================================================================

// GET /api/influencer/dashboard - Main dashboard overview
router.get('/dashboard', authenticateToken, checkInfluencerAccess, async (req: InfluencerAuthRequest, res) => {
  try {
    const influencerId = req.influencerId;
    const { timeframe = '30' } = req.query; // Default 30 days

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeframe as string));

    // Get influencer profile
    const { data: influencer, error: influencerError } = await supabase
      .from('influencer_profiles')
      .select('*')
      .eq('id', influencerId)
      .single();

    if (influencerError) throw influencerError;

    // Get conversions for time period
    const { data: conversions, error: conversionsError } = await supabase
      .from('influencer_conversions')
      .select('*')
      .eq('influencer_id', influencerId)
      .gte('conversion_date', startDate.toISOString())
      .lte('conversion_date', endDate.toISOString());

    const totalConversions = conversions?.length || 0;
    const activeSubscriptions = conversions?.filter(c => c.conversion_status === 'active').length || 0;

    // Get commission transactions for time period
    const { data: transactions, error: transactionsError } = await supabase
      .from('influencer_commission_transactions')
      .select('*')
      .eq('influencer_id', influencerId)
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());

    const totalEarnings = transactions?.reduce((sum, t) => sum + (t.commission_cents || 0), 0) || 0;

    // Get content performance for time period
    const { data: content, error: contentError } = await supabase
      .from('influencer_content_tracking')
      .select('*')
      .eq('influencer_id', influencerId)
      .gte('post_date', startDate.toISOString())
      .lte('post_date', endDate.toISOString());

    const totalViews = content?.reduce((sum, c) => sum + (c.views || 0), 0) || 0;
    const totalClicks = content?.reduce((sum, c) => sum + (c.clicks_generated || 0), 0) || 0;
    const totalEngagement = content?.reduce((sum, c) => sum + (c.likes || 0) + (c.comments || 0) + (c.shares || 0), 0) || 0;

    // Calculate conversion rate
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    // Calculate tier progress
    const tierThresholds = {
      nano: { min: 0, max: 10000 },
      micro: { min: 10000, max: 100000 },
      macro: { min: 100000, max: 1000000 },
      mega: { min: 1000000, max: Infinity }
    };

    const currentTier = influencer.influencer_tier || 'nano';
    const followerCount = influencer.follower_count || 0;
    const tierInfo = tierThresholds[currentTier as keyof typeof tierThresholds];
    const progressToNextTier = tierInfo.max === Infinity ? 100 : 
      ((followerCount - tierInfo.min) / (tierInfo.max - tierInfo.min)) * 100;

    res.json({
      success: true,
      influencer: {
        id: influencer.id,
        name: influencer.influencer_name,
        handle: influencer.platform_handle,
        platform: influencer.platform,
        tier: influencer.influencer_tier,
        status: influencer.influencer_status,
        followerCount: influencer.follower_count,
        commissionRate: influencer.commission_percentage,
        equityPercentage: influencer.equity_percentage,
        equityVested: influencer.equity_vested_percentage,
        promoCode: influencer.unique_promo_code,
        referralLink: influencer.referral_link,
      },
      metrics: {
        totalConversions,
        activeSubscriptions,
        totalEarnings: totalEarnings / 100, // Convert to dollars
        conversionRate: Math.round(conversionRate * 10) / 10,
        totalViews,
        totalClicks,
        totalEngagement,
        totalContent: content?.length || 0,
        tierProgress: Math.min(100, Math.max(0, progressToNextTier)),
        nextTierName: currentTier === 'mega' ? 'Mega (Max)' : 
          currentTier === 'macro' ? 'Mega' :
          currentTier === 'micro' ? 'Macro' : 'Micro',
      },
      timeframe: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days: parseInt(timeframe as string),
      }
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// ============================================================================
// CONTENT TRACKING ENDPOINTS
// ============================================================================

// GET /api/influencer/content - Get all content posts
router.get('/content', authenticateToken, checkInfluencerAccess, async (req: InfluencerAuthRequest, res) => {
  try {
    const influencerId = req.influencerId;
    const { page = '1', limit = '20', status } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabase
      .from('influencer_content_tracking')
      .select('*', { count: 'exact' })
      .eq('influencer_id', influencerId)
      .order('post_date', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (status) query = query.eq('approval_status', status as string);

    const { data: content, error, count } = await query;

    if (error) throw error;

    const formattedContent = content?.map(c => ({
      id: c.id,
      type: c.content_type,
      url: c.content_url,
      postDate: c.post_date,
      views: c.views,
      likes: c.likes,
      comments: c.comments,
      shares: c.shares,
      engagementRate: c.engagement_rate,
      clicks: c.clicks_generated,
      conversions: c.conversions_generated,
      revenue: (c.revenue_generated_cents || 0) / 100,
      commission: (c.commission_earned_cents || 0) / 100,
      approvalStatus: c.approval_status,
      caption: c.content_caption,
    })) || [];

    res.json({
      success: true,
      content: formattedContent,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / parseInt(limit as string)),
      }
    });

  } catch (error) {
    console.error('Content error:', error);
    res.status(500).json({ error: 'Failed to load content' });
  }
});

// POST /api/influencer/content - Submit new content for tracking
router.post('/content', authenticateToken, checkInfluencerAccess, async (req: InfluencerAuthRequest, res) => {
  try {
    const influencerId = req.influencerId;
    const { contentType, contentUrl, caption, tags } = req.body;

    const { data, error } = await supabase
      .from('influencer_content_tracking')
      .insert({
        influencer_id: influencerId,
        content_type: contentType,
        content_url: contentUrl,
        content_caption: caption,
        content_tags: tags,
        post_date: new Date().toISOString(),
        approval_status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      content: data,
      message: 'Content submitted for review'
    });

  } catch (error) {
    console.error('Content submission error:', error);
    res.status(500).json({ error: 'Failed to submit content' });
  }
});

// ============================================================================
// CONVERSIONS TRACKING ENDPOINTS
// ============================================================================

// GET /api/influencer/conversions - Get all conversions
router.get('/conversions', authenticateToken, checkInfluencerAccess, async (req: InfluencerAuthRequest, res) => {
  try {
    const influencerId = req.influencerId;
    const { page = '1', limit = '50', status = 'active' } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const { data: conversions, error, count } = await supabase
      .from('influencer_conversions')
      .select(`
        *,
        user:converted_user_id(
          email,
          user_profiles!user_profiles_id_fkey(full_name)
        )
      `, { count: 'exact' })
      .eq('influencer_id', influencerId)
      .eq('conversion_status', status as string)
      .order('conversion_date', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (error) throw error;

    const formattedConversions = conversions?.map(c => ({
      id: c.id,
      userName: c.user?.user_profiles?.full_name || c.user?.email || 'Unknown',
      userEmail: c.user?.email,
      conversionType: c.conversion_type,
      subscriptionTier: c.subscription_tier,
      promoCodeUsed: c.promo_code_used,
      conversionDate: c.conversion_date,
      initialRevenue: (c.initial_revenue_cents || 0) / 100,
      lifetimeValue: (c.lifetime_value_cents || 0) / 100,
      totalCommission: (c.total_commission_earned_cents || 0) / 100,
      status: c.conversion_status,
      daysSinceConversion: Math.floor((Date.now() - new Date(c.conversion_date).getTime()) / (1000 * 60 * 60 * 24)),
    })) || [];

    res.json({
      success: true,
      conversions: formattedConversions,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / parseInt(limit as string)),
      }
    });

  } catch (error) {
    console.error('Conversions error:', error);
    res.status(500).json({ error: 'Failed to load conversions' });
  }
});

// ============================================================================
// COMMISSION TRACKING ENDPOINTS
// ============================================================================

// GET /api/influencer/commissions - Get commission transaction history
router.get('/commissions', authenticateToken, checkInfluencerAccess, async (req: InfluencerAuthRequest, res) => {
  try {
    const influencerId = req.influencerId;
    const { page = '1', limit = '50', startDate, endDate, transactionType } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabase
      .from('influencer_commission_transactions')
      .select(`
        *,
        user:converted_user_id(email),
        conversion:conversion_id(subscription_tier)
      `, { count: 'exact' })
      .eq('influencer_id', influencerId)
      .order('transaction_date', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (startDate) query = query.gte('transaction_date', startDate as string);
    if (endDate) query = query.lte('transaction_date', endDate as string);
    if (transactionType) query = query.eq('transaction_type', transactionType as string);

    const { data: transactions, error, count } = await query;

    if (error) throw error;

    const formattedTransactions = transactions?.map(t => ({
      id: t.id,
      date: t.transaction_date,
      type: t.transaction_type,
      amount: (t.amount_cents || 0) / 100,
      commission: (t.commission_cents || 0) / 100,
      commissionRate: t.commission_percentage_applied,
      userEmail: t.user?.email || 'N/A',
      subscriptionTier: t.conversion?.subscription_tier || 'N/A',
      paidToInfluencer: t.paid_to_influencer,
      paymentDate: t.payment_date,
    })) || [];

    res.json({
      success: true,
      transactions: formattedTransactions,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / parseInt(limit as string)),
      }
    });

  } catch (error) {
    console.error('Commissions error:', error);
    res.status(500).json({ error: 'Failed to load commissions' });
  }
});

// GET /api/influencer/commissions/summary - Get commission summary by period
router.get('/commissions/summary', authenticateToken, checkInfluencerAccess, async (req: InfluencerAuthRequest, res) => {
  try {
    const influencerId = req.influencerId;
    const { period = 'monthly', months = '12' } = req.query;

    const { data: snapshots, error } = await supabase
      .from('influencer_metrics_snapshots')
      .select('*')
      .eq('influencer_id', influencerId)
      .eq('period_type', period as string)
      .order('snapshot_date', { ascending: false })
      .limit(parseInt(months as string));

    if (error) throw error;

    const summary = snapshots?.map(s => ({
      date: s.snapshot_date,
      revenue: (s.revenue_generated_cents || 0) / 100,
      commission: (s.commission_earned_cents || 0) / 100,
      referralBonus: (s.referral_bonus_cents || 0) / 100,
      totalEarnings: (s.total_earnings_cents || 0) / 100,
      conversions: s.total_conversions,
      clicks: s.total_clicks,
      conversionRate: s.conversion_rate,
    })).reverse() || [];

    res.json({
      success: true,
      period: period,
      summary,
    });

  } catch (error) {
    console.error('Commission summary error:', error);
    res.status(500).json({ error: 'Failed to load commission summary' });
  }
});

// ============================================================================
// REFERRAL TRACKING ENDPOINTS
// ============================================================================

// GET /api/influencer/referrals - Get referral network and bonuses
router.get('/referrals', authenticateToken, checkInfluencerAccess, async (req: InfluencerAuthRequest, res) => {
  try {
    const influencerId = req.influencerId;

    // Get direct referrals (Level 1)
    const { data: level1Referrals, error: level1Error } = await supabase
      .from('influencer_referrals')
      .select(`
        *,
        influencer:referred_influencer_id(*)
      `)
      .eq('referrer_influencer_id', influencerId)
      .eq('referral_level', 1);

    // Get indirect referrals (Level 2)
    const level1Ids = level1Referrals?.map(r => r.referred_influencer_id) || [];
    let level2Referrals: any[] = [];

    if (level1Ids.length > 0) {
      const { data } = await supabase
        .from('influencer_referrals')
        .select(`
          *,
          influencer:referred_influencer_id(*)
        `)
        .in('referrer_influencer_id', level1Ids)
        .eq('referral_level', 2);

      level2Referrals = data || [];
    }

    // Calculate referral earnings
    const level1Bonus = level1Referrals?.reduce((sum, r) => sum + (r.total_bonus_earned_cents || 0), 0) || 0;
    const level2Bonus = level2Referrals?.reduce((sum, r) => sum + (r.total_bonus_earned_cents || 0), 0) || 0;
    const totalBonus = level1Bonus + level2Bonus;

    // Check for network effect bonus
    const totalReferrals = (level1Referrals?.length || 0) + (level2Referrals?.length || 0);
    const networkBonus = totalReferrals >= 5 ? 0.1 : 0;

    res.json({
      success: true,
      referrals: {
        level1Count: level1Referrals?.length || 0,
        level2Count: level2Referrals?.length || 0,
        totalReferrals,
        level1Bonus: level1Bonus / 100,
        level2Bonus: level2Bonus / 100,
        totalMonthlyBonus: totalBonus / 100,
        networkBonusEligible: totalReferrals >= 5,
        networkBonusEquity: networkBonus,
      },
      level1Referrals: level1Referrals?.map(r => ({
        id: r.id,
        name: r.influencer?.influencer_name,
        handle: r.influencer?.platform_handle,
        platform: r.influencer?.platform,
        status: r.referral_status,
        bonusEarned: (r.total_bonus_earned_cents || 0) / 100,
        referralDate: r.referral_date,
      })) || [],
      level2Referrals: level2Referrals?.map(r => ({
        id: r.id,
        name: r.influencer?.influencer_name,
        handle: r.influencer?.platform_handle,
        platform: r.influencer?.platform,
        status: r.referral_status,
        bonusEarned: (r.total_bonus_earned_cents || 0) / 100,
        referralDate: r.referral_date,
      })) || [],
    });

  } catch (error) {
    console.error('Referrals error:', error);
    res.status(500).json({ error: 'Failed to load referrals' });
  }
});

// ============================================================================
// ANALYTICS ENDPOINTS
// ============================================================================

// GET /api/influencer/analytics/performance - Performance metrics over time
router.get('/analytics/performance', authenticateToken, checkInfluencerAccess, async (req: InfluencerAuthRequest, res) => {
  try {
    const influencerId = req.influencerId;
    const { months = '12' } = req.query;

    const { data: snapshots, error } = await supabase
      .from('influencer_metrics_snapshots')
      .select('*')
      .eq('influencer_id', influencerId)
      .eq('period_type', 'monthly')
      .order('snapshot_date', { ascending: true })
      .limit(parseInt(months as string));

    if (error) throw error;

    const performanceData = snapshots?.map(s => ({
      month: new Date(s.snapshot_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
      conversions: s.total_conversions || 0,
      clicks: s.total_clicks || 0,
      conversionRate: s.conversion_rate || 0,
      earnings: (s.total_earnings_cents || 0) / 100,
      followers: s.follower_count || 0,
      engagement: s.average_engagement_rate || 0,
      posts: s.posts_created || 0,
    })) || [];

    res.json({
      success: true,
      performanceData,
    });

  } catch (error) {
    console.error('Performance analytics error:', error);
    res.status(500).json({ error: 'Failed to load performance analytics' });
  }
});

export default router;