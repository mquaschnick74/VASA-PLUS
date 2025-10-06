// Location: server/routes/partner-routes.ts
// This file handles all partner-related API endpoints for revenue tracking and analytics

import { Router } from 'express';
import { supabase } from '../services/supabase-service';
import { authenticateToken, AuthRequest } from '../middleware/auth';

// Extend AuthRequest to include partner properties
interface PartnerAuthRequest extends AuthRequest {
  userId?: string;
  partnerId?: string;
  partnerUser?: any;
}

const router = Router();

// ============================================================================
// PARTNER AUTHENTICATION & ACCESS CONTROL
// ============================================================================

async function checkPartnerAccess(req: PartnerAuthRequest, res: any, next: any) {
  try {
    const userId = req.userId;

    // ADD THIS DEBUG LOGGING
    console.log('🔍 [PARTNER ACCESS] Checking access for userId:', userId);

    // Check if user is a partner user
    const { data: partnerUser, error } = await supabase
      .from('partner_users')
      .select(`
        *,
        partner:partner_organizations(*)
      `)
      .eq('user_id', userId)
      .eq('access_status', 'active')
      .single();

    // ADD THIS DEBUG LOGGING
    console.log('🔍 [PARTNER ACCESS] Query result:', { partnerUser, error });

    if (error || !partnerUser) {
      console.log('❌ [PARTNER ACCESS] Access denied:', error?.message || 'No partner user found');
      return res.status(403).json({ error: 'No partner access' });
    }

    // Attach partner info to request
    req.partnerUser = partnerUser;
    req.partnerId = partnerUser.partner_id;

    next();
  } catch (error) {
    console.error('Partner access check error:', error);
    res.status(500).json({ error: 'Failed to verify partner access' });
  }
}

// ============================================================================
// DASHBOARD OVERVIEW ENDPOINTS
// ============================================================================

// GET /api/partner/dashboard - Main dashboard overview
router.get('/dashboard', authenticateToken, checkPartnerAccess, async (req: PartnerAuthRequest, res) => {
  try {
    const partnerId = req.partnerId;
    const { timeframe = '30' } = req.query; // Default 30 days

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeframe as string));

    // Get partner details
    const { data: partner, error: partnerError } = await supabase
      .from('partner_organizations')
      .select('*')
      .eq('id', partnerId)
      .single();

    if (partnerError) throw partnerError;

    // Get active therapists count
    const { data: therapists, error: therapistsError } = await supabase
      .from('partner_therapist_attribution')
      .select('therapist_id')
      .eq('partner_id', partnerId)
      .eq('status', 'active');

    const activeTherapistsCount = therapists?.length || 0;

    // Get revenue for time period
    const { data: transactions, error: transactionsError } = await supabase
      .from('partner_revenue_transactions')
      .select('*')
      .eq('partner_id', partnerId)
      .gte('transaction_date', startDate.toISOString())
      .lte('transaction_date', endDate.toISOString());

    const totalRevenue = transactions?.reduce((sum, t) => sum + (t.amount_cents || 0), 0) || 0;
    const partnerShare = transactions?.reduce((sum, t) => sum + (t.partner_revenue_share_cents || 0), 0) || 0;

    // Get usage sessions for time period
    const therapistIds = therapists?.map(t => t.therapist_id) || [];
    let totalMinutes = 0;
    let totalSessions = 0;

    if (therapistIds.length > 0) {
      const { data: usageSessions } = await supabase
        .from('usage_sessions')
        .select('duration_minutes')
        .in('user_id', therapistIds)
        .gte('session_date', startDate.toISOString())
        .lte('session_date', endDate.toISOString());

      totalMinutes = usageSessions?.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) || 0;
      totalSessions = usageSessions?.length || 0;
    }

    // Get latest metrics snapshot
    const { data: latestSnapshot } = await supabase
      .from('partner_metrics_snapshots')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('period_type', 'monthly')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    // Calculate tier progress
    const tierThresholds = {
      bronze: { min: 5000, max: 25000 },
      silver: { min: 25000, max: 100000 },
      gold: { min: 100000, max: 500000 },
      platinum: { min: 500000, max: Infinity }
    };

    const currentTier = partner.partner_tier || 'bronze';
    const monthlyRevenueDollars = (partner.monthly_recurring_revenue || 0) / 100;
    const tierInfo = tierThresholds[currentTier as keyof typeof tierThresholds];
    const progressToNextTier = tierInfo.max === Infinity ? 100 : 
      ((monthlyRevenueDollars - tierInfo.min) / (tierInfo.max - tierInfo.min)) * 100;

    res.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.organization_name,
        tier: partner.partner_tier,
        status: partner.partner_status,
        model: partner.partnership_model,
        equityPercentage: partner.equity_percentage,
        equityVested: partner.equity_vested_percentage,
        revenueShareRate: partner.revenue_share_percentage,
      },
      metrics: {
        activeTherapists: activeTherapistsCount,
        totalRevenue: totalRevenue / 100, // Convert to dollars
        partnerShare: partnerShare / 100,
        totalSessions,
        totalMinutes,
        monthlyRecurringRevenue: (partner.monthly_recurring_revenue || 0) / 100,
        tierProgress: Math.min(100, Math.max(0, progressToNextTier)),
        nextTierName: currentTier === 'platinum' ? 'Platinum (Max)' : 
          currentTier === 'gold' ? 'Platinum' :
          currentTier === 'silver' ? 'Gold' : 'Silver',
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
// REVENUE TRACKING ENDPOINTS
// ============================================================================

// GET /api/partner/revenue/transactions - Get revenue transaction history
router.get('/revenue/transactions', authenticateToken, checkPartnerAccess, async (req: PartnerAuthRequest, res) => {
  try {
    const partnerId = req.partnerId;
    const { page = '1', limit = '50', startDate, endDate, transactionType } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = supabase
      .from('partner_revenue_transactions')
      .select(`
        *,
        therapist:therapist_id(email, full_name),
        subscription:subscription_id(subscription_tier)
      `, { count: 'exact' })
      .eq('partner_id', partnerId)
      .order('transaction_date', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (startDate) query = query.gte('transaction_date', startDate as string);
    if (endDate) query = query.lte('transaction_date', endDate as string);
    if (transactionType) query = query.eq('transaction_type', transactionType as string);

    const { data: transactions, error, count } = await query;

    if (error) throw error;

    // Format transactions for display
    const formattedTransactions = transactions?.map(t => ({
      id: t.id,
      date: t.transaction_date,
      type: t.transaction_type,
      amount: (t.amount_cents || 0) / 100,
      partnerShare: (t.partner_revenue_share_cents || 0) / 100,
      shareRate: t.revenue_share_percentage_applied,
      therapist: t.therapist?.full_name || t.therapist?.email || 'N/A',
      subscriptionTier: t.subscription?.subscription_tier || 'N/A',
      billingPeriod: t.billing_period_start && t.billing_period_end ? 
        `${new Date(t.billing_period_start).toLocaleDateString()} - ${new Date(t.billing_period_end).toLocaleDateString()}` : 
        'N/A',
      paidToPartner: t.paid_to_partner,
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
    console.error('Transactions error:', error);
    res.status(500).json({ error: 'Failed to load transactions' });
  }
});

// GET /api/partner/revenue/summary - Get revenue summary by period
router.get('/revenue/summary', authenticateToken, checkPartnerAccess, async (req: PartnerAuthRequest, res) => {
  try {
    const partnerId = req.partnerId;
    const { period = 'monthly', months = '12' } = req.query;

    const { data: snapshots, error } = await supabase
      .from('partner_metrics_snapshots')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('period_type', period as string)
      .order('snapshot_date', { ascending: false })
      .limit(parseInt(months as string));

    if (error) throw error;

    const summary = snapshots?.map(s => ({
      date: s.snapshot_date,
      revenue: (s.revenue_generated_cents || 0) / 100,
      revenueShare: (s.revenue_share_paid_cents || 0) / 100,
      mrr: (s.mrr_cents || 0) / 100,
      arr: (s.arr_cents || 0) / 100,
      therapists: s.active_therapists_count,
      sessions: s.total_voice_sessions,
      minutes: s.total_voice_minutes,
    })).reverse() || []; // Reverse to show oldest first (for charts)

    res.json({
      success: true,
      period: period,
      summary,
    });

  } catch (error) {
    console.error('Revenue summary error:', error);
    res.status(500).json({ error: 'Failed to load revenue summary' });
  }
});

// ============================================================================
// THERAPIST TRACKING ENDPOINTS
// ============================================================================

// GET /api/partner/therapists - Get all attributed therapists
router.get('/therapists', authenticateToken, checkPartnerAccess, async (req: PartnerAuthRequest, res) => {
  try {
    const partnerId = req.partnerId;
    const { status = 'active', page = '1', limit = '50' } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const { data: attributions, error, count } = await supabase
      .from('partner_therapist_attribution')
      .select(`
        *,
        therapist:therapist_id(
          id,
          email,
          full_name,
          user_profiles(full_name)
        )
      `, { count: 'exact' })
      .eq('partner_id', partnerId)
      .eq('status', status as string)
      .order('attribution_date', { ascending: false })
      .range(offset, offset + parseInt(limit as string) - 1);

    if (error) throw error;

    // Get usage data for each therapist
    const therapistsWithUsage = await Promise.all(
      (attributions || []).map(async (attr) => {
        const { data: sessions } = await supabase
          .from('usage_sessions')
          .select('duration_minutes, session_date')
          .eq('user_id', attr.therapist_id)
          .order('session_date', { ascending: false })
          .limit(1);

        const { data: totalUsage } = await supabase
          .from('usage_sessions')
          .select('duration_minutes')
          .eq('user_id', attr.therapist_id);

        const totalMinutes = totalUsage?.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) || 0;
        const lastSessionDate = sessions?.[0]?.session_date || null;

        return {
          id: attr.id,
          therapistId: attr.therapist_id,
          therapistName: attr.therapist?.user_profiles?.full_name || attr.therapist?.full_name || attr.therapist?.email,
          therapistEmail: attr.therapist?.email,
          attributionSource: attr.attribution_source,
          attributionDate: attr.attribution_date,
          firstSessionDate: attr.first_session_date,
          lastSessionDate: lastSessionDate,
          totalMinutes,
          totalSessions: totalUsage?.length || 0,
          lifetimeRevenue: (attr.total_lifetime_revenue_cents || 0) / 100,
          status: attr.status,
          referralCode: attr.referral_code,
        };
      })
    );

    res.json({
      success: true,
      therapists: therapistsWithUsage,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / parseInt(limit as string)),
      }
    });

  } catch (error) {
    console.error('Therapists error:', error);
    res.status(500).json({ error: 'Failed to load therapists' });
  }
});

// ============================================================================
// EQUITY TRACKING ENDPOINTS
// ============================================================================

// GET /api/partner/equity/status - Get current equity status and vesting schedule
router.get('/equity/status', authenticateToken, checkPartnerAccess, async (req: PartnerAuthRequest, res) => {
  try {
    const partnerId = req.partnerId;

    // Get partner equity details
    const { data: partner, error: partnerError } = await supabase
      .from('partner_organizations')
      .select('*')
      .eq('id', partnerId)
      .single();

    if (partnerError) throw partnerError;

    // Get vesting schedule
    const { data: vestingSchedule, error: vestingError } = await supabase
      .from('partner_equity_vesting_schedule')
      .select('*')
      .eq('partner_id', partnerId)
      .order('vesting_date', { ascending: true });

    if (vestingError) throw vestingError;

    // Calculate vesting progress
    const totalEquity = partner.equity_percentage || 0;
    const vestedEquity = partner.equity_vested_percentage || 0;
    const unvestedEquity = totalEquity - vestedEquity;
    const vestingProgress = totalEquity > 0 ? (vestedEquity / totalEquity) * 100 : 0;

    // Find next vesting event
    const now = new Date();
    const nextVesting = vestingSchedule?.find(v => 
      new Date(v.vesting_date) > now && v.vesting_status === 'pending'
    );

    // Format vesting schedule
    const formattedSchedule = vestingSchedule?.map(v => ({
      id: v.id,
      date: v.vesting_date,
      amount: v.equity_percentage_vesting,
      cumulative: v.cumulative_vested_percentage,
      status: v.vesting_status,
      performanceMet: v.performance_met,
      requiredRevenue: (v.required_monthly_revenue_cents || 0) / 100,
      actualRevenue: (v.actual_monthly_revenue_cents || 0) / 100,
      isPast: new Date(v.vesting_date) < now,
      vestedAt: v.vested_at,
    })) || [];

    res.json({
      success: true,
      equity: {
        total: totalEquity,
        vested: vestedEquity,
        unvested: unvestedEquity,
        vestingProgress,
        cliffDate: partner.equity_cliff_date,
        nextVestingDate: partner.next_vesting_date,
        hasPassedCliff: partner.equity_cliff_date ? new Date(partner.equity_cliff_date) < now : false,
      },
      nextVesting: nextVesting ? {
        date: nextVesting.vesting_date,
        amount: nextVesting.equity_percentage_vesting,
        daysUntil: Math.ceil((new Date(nextVesting.vesting_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      } : null,
      vestingSchedule: formattedSchedule,
    });

  } catch (error) {
    console.error('Equity status error:', error);
    res.status(500).json({ error: 'Failed to load equity status' });
  }
});

// ============================================================================
// REFERRAL TRACKING ENDPOINTS
// ============================================================================

// GET /api/partner/referrals - Get referral network and bonuses
router.get('/referrals', authenticateToken, checkPartnerAccess, async (req: PartnerAuthRequest, res) => {
  try {
    const partnerId = req.partnerId;

    // Get direct referrals (Level 1)
    const { data: level1Partners, error: level1Error } = await supabase
      .from('partner_organizations')
      .select('*')
      .eq('referred_by_partner_id', partnerId)
      .eq('referral_level', 1);

    // Get indirect referrals (Level 2)
    const level1Ids = level1Partners?.map(p => p.id) || [];
    let level2Partners: any[] = [];

    if (level1Ids.length > 0) {
      const { data } = await supabase
        .from('partner_organizations')
        .select('*')
        .in('referred_by_partner_id', level1Ids)
        .eq('referral_level', 2);

      level2Partners = data || [];
    }

    // Calculate referral revenue
    const level1Revenue = level1Partners?.reduce((sum, p) => sum + (p.monthly_recurring_revenue || 0), 0) || 0;
    const level2Revenue = level2Partners?.reduce((sum, p) => sum + (p.monthly_recurring_revenue || 0), 0) || 0;

    // Referral bonuses (3% for level 1, 1% for level 2)
    const level1Bonus = level1Revenue * 0.03;
    const level2Bonus = level2Revenue * 0.01;
    const totalBonus = level1Bonus + level2Bonus;

    // Check for network effect bonus (5+ partners referred)
    const totalReferrals = (level1Partners?.length || 0) + (level2Partners?.length || 0);
    const networkBonus = totalReferrals >= 5 ? 0.1 : 0; // 0.1% additional equity

    res.json({
      success: true,
      referrals: {
        level1Count: level1Partners?.length || 0,
        level2Count: level2Partners?.length || 0,
        totalReferrals,
        level1Revenue: level1Revenue / 100,
        level2Revenue: level2Revenue / 100,
        level1Bonus: level1Bonus / 100,
        level2Bonus: level2Bonus / 100,
        totalMonthlyBonus: totalBonus / 100,
        networkBonusEligible: totalReferrals >= 5,
        networkBonusEquity: networkBonus,
      },
      level1Partners: level1Partners?.map(p => ({
        id: p.id,
        name: p.organization_name,
        status: p.partner_status,
        tier: p.partner_tier,
        mrr: (p.monthly_recurring_revenue || 0) / 100,
        activeSince: p.active_since,
      })) || [],
      level2Partners: level2Partners?.map(p => ({
        id: p.id,
        name: p.organization_name,
        status: p.partner_status,
        tier: p.partner_tier,
        mrr: (p.monthly_recurring_revenue || 0) / 100,
        referredBy: p.referred_by_partner_id,
      })) || [],
    });

  } catch (error) {
    console.error('Referrals error:', error);
    res.status(500).json({ error: 'Failed to load referrals' });
  }
});

// ============================================================================
// ANALYTICS & CHARTS ENDPOINTS
// ============================================================================

// GET /api/partner/analytics/growth - Growth metrics over time
router.get('/analytics/growth', authenticateToken, checkPartnerAccess, async (req: PartnerAuthRequest, res) => {
  try {
    const partnerId = req.partnerId;
    const { months = '12' } = req.query;

    const { data: snapshots, error } = await supabase
      .from('partner_metrics_snapshots')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('period_type', 'monthly')
      .order('snapshot_date', { ascending: true })
      .limit(parseInt(months as string));

    if (error) throw error;

    const growthData = snapshots?.map(s => ({
      month: new Date(s.snapshot_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }),
      therapists: s.active_therapists_count || 0,
      clients: s.active_clients_count || 0,
      revenue: (s.revenue_generated_cents || 0) / 100,
      sessions: s.total_voice_sessions || 0,
      minutes: s.total_voice_minutes || 0,
      mrr: (s.mrr_cents || 0) / 100,
    })) || [];

    res.json({
      success: true,
      growthData,
    });

  } catch (error) {
    console.error('Growth analytics error:', error);
    res.status(500).json({ error: 'Failed to load growth analytics' });
  }
});

// GET /api/partner/analytics/usage - Usage breakdown and trends
router.get('/analytics/usage', authenticateToken, checkPartnerAccess, async (req: PartnerAuthRequest, res) => {
  try {
    const partnerId = req.partnerId;
    const { days = '30' } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));

    // Get attributed therapists
    const { data: attributions } = await supabase
      .from('partner_therapist_attribution')
      .select('therapist_id')
      .eq('partner_id', partnerId)
      .eq('status', 'active');

    const therapistIds = attributions?.map(a => a.therapist_id) || [];

    if (therapistIds.length === 0) {
      return res.json({
        success: true,
        usage: {
          totalSessions: 0,
          totalMinutes: 0,
          averageSessionLength: 0,
          activeTherapists: 0,
          dailyBreakdown: [],
        }
      });
    }

    // Get usage sessions
    const { data: sessions } = await supabase
      .from('usage_sessions')
      .select('*')
      .in('user_id', therapistIds)
      .gte('session_date', startDate.toISOString())
      .lte('session_date', endDate.toISOString())
      .order('session_date', { ascending: true });

    const totalSessions = sessions?.length || 0;
    const totalMinutes = sessions?.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) || 0;
    const averageSessionLength = totalSessions > 0 ? totalMinutes / totalSessions : 0;

    // Get unique therapists who had sessions
    const activeTherapists = new Set(sessions?.map(s => s.user_id)).size;

    // Group by day for chart
    const dailyMap = new Map();
    sessions?.forEach(s => {
      const day = new Date(s.session_date).toLocaleDateString();
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { sessions: 0, minutes: 0 });
      }
      const dayData = dailyMap.get(day);
      dayData.sessions++;
      dayData.minutes += s.duration_minutes || 0;
    });

    const dailyBreakdown = Array.from(dailyMap.entries()).map(([day, data]) => ({
      date: day,
      sessions: data.sessions,
      minutes: data.minutes,
    }));

    res.json({
      success: true,
      usage: {
        totalSessions,
        totalMinutes,
        averageSessionLength: Math.round(averageSessionLength * 10) / 10,
        activeTherapists,
        dailyBreakdown,
      }
    });

  } catch (error) {
    console.error('Usage analytics error:', error);
    res.status(500).json({ error: 'Failed to load usage analytics' });
  }
});

export default router;