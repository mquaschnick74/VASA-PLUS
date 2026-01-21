// Location: client/src/pages/partner-dashboard.tsx
// Main partner dashboard for tracking revenue, equity, therapists, and analytics

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TechnicalSupportCard } from '@/components/TechnicalSupportCard';
import { supabase } from '@/lib/supabaseClient';
import { handleLogout } from '@/lib/auth-helpers';
import { getApiUrl } from '@/lib/platform';
import { Link } from 'wouter';
import Header from '@/components/shared/Header';
import {
  DollarSign,
  Users,
  TrendingUp,
  Clock,
  Award,
  UserPlus,
  BarChart3,
  FileText,
  Settings,
  LogOut,
  HelpCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface PartnerDashboardProps {
  userId: string;
  setUserId: (id: string | null) => void;
}

interface DashboardData {
  partner: {
    id: string;
    name: string;
    tier: string;
    status: string;
    model: string;
    equityPercentage: number;
    equityVested: number;
    revenueShareRate: number;
  };
  metrics: {
    activeTherapists: number;
    totalRevenue: number;
    partnerShare: number;
    totalSessions: number;
    totalMinutes: number;
    monthlyRecurringRevenue: number;
    tierProgress: number;
    nextTierName: string;
  };
  timeframe: {
    startDate: string;
    endDate: string;
    days: number;
  };
}

export default function PartnerDashboard({ userId, setUserId }: PartnerDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [timeframe, setTimeframe] = useState('30');
  const viewAsData = sessionStorage.getItem('adminViewAs');
  const partnerId = viewAsData ? JSON.parse(viewAsData).partnerId : null;

  // Revenue data
  const [revenueTransactions, setRevenueTransactions] = useState<any[]>([]);
  const [revenueSummary, setRevenueSummary] = useState<any[]>([]);

  // Therapist data
  const [therapists, setTherapists] = useState<any[]>([]);

  // Equity data
  const [equityData, setEquityData] = useState<any>(null);

  // Referral data
  const [referralData, setReferralData] = useState<any>(null);

  // Growth analytics
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [usageData, setUsageData] = useState<any>(null);

  useEffect(() => {
    loadDashboard();
  }, [userId, timeframe]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      if (!token) {
        console.error('No auth token');
        try {
          const { withTimeout } = await import('@/lib/auth-helpers');
          await withTimeout(supabase.auth.signOut(), 3000);
        } catch (error) {
          console.warn('⚠️ SignOut timeout/error (no token):', error);
        }
        setUserId(null);
        return;
      }

      // Load main dashboard
      const dashResponse = await fetch(`/api/partner/dashboard?timeframe=${timeframe}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!dashResponse.ok) {
        throw new Error('Failed to load dashboard');
      }

      const dashData = await dashResponse.json();
      setDashboardData(dashData);

      // Load additional data based on selected tab
      if (selectedTab === 'revenue') {
        await loadRevenueData(token);
      } else if (selectedTab === 'therapists') {
        await loadTherapistData(token);
      } else if (selectedTab === 'equity') {
        await loadEquityData(token);
      } else if (selectedTab === 'referrals') {
        await loadReferralData(token);
      } else if (selectedTab === 'analytics') {
        await loadAnalyticsData(token);
      }

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRevenueData = async (token: string) => {
    try {
      // Load transactions
      const transResponse = await fetch(getApiUrl('/api/partner/revenue/transactions?limit=10'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const transData = await transResponse.json();
      setRevenueTransactions(transData.transactions || []);

      // Load summary
      const summaryResponse = await fetch(getApiUrl('/api/partner/revenue/summary'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const summaryData = await summaryResponse.json();
      setRevenueSummary(summaryData.summary || []);
    } catch (error) {
      console.error('Error loading revenue data:', error);
    }
  };

  const loadTherapistData = async (token: string) => {
    console.log('🔍 [THERAPISTS] Loading therapist data...');
    try {
      const response = await fetch(getApiUrl('/api/partner/therapists'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('🔍 [THERAPISTS] API response status:', response.status);
      const data = await response.json();
      console.log('🔍 [THERAPISTS] API returned:', data);
      setTherapists(data.therapists || []);
    } catch (error) {
      console.error('Error loading therapist data:', error);
    }
  };

  const loadEquityData = async (token: string) => {
    try {
      const response = await fetch(getApiUrl('/api/partner/equity/status'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setEquityData(data);
    } catch (error) {
      console.error('Error loading equity data:', error);
    }
  };

  const loadReferralData = async (token: string) => {
    try {
      const response = await fetch(getApiUrl('/api/partner/referrals'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setReferralData(data);
    } catch (error) {
      console.error('Error loading referral data:', error);
    }
  };

  const loadAnalyticsData = async (token: string) => {
    try {
      // Load growth data
      const growthResponse = await fetch(getApiUrl('/api/partner/analytics/growth'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const growthDataResult = await growthResponse.json();
      setGrowthData(growthDataResult.growthData || []);

      // Load usage data
      const usageResponse = await fetch(getApiUrl(`/api/partner/analytics/usage?days=${timeframe}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const usageDataResult = await usageResponse.json();
      setUsageData(usageDataResult.usage);
    } catch (error) {
      console.error('Error loading analytics data:', error);
    }
  };

  const handleSignOut = () => {
    handleLogout(setUserId);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'platinum': return 'text-purple-500';
      case 'gold': return 'text-yellow-500';
      case 'silver': return 'text-gray-400';
      case 'bronze': return 'text-orange-500';
      default: return 'text-gray-500';
    }
  };

  const getTierBadgeColor = (tier: string) => {
    switch (tier) {
      case 'platinum': return 'bg-purple-500/20 text-purple-500 border-purple-500';
      case 'gold': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500';
      case 'silver': return 'bg-gray-400/20 text-gray-400 border-gray-400';
      case 'bronze': return 'bg-orange-500/20 text-orange-500 border-orange-500';
      default: return 'bg-gray-500/20 text-gray-500 border-gray-500';
    }
  };

  if (loading || !dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const { partner, metrics } = dashboardData

  console.log('🎨 [RENDERING] Dashboard data:', dashboardData);
  console.log('🎨 [RENDERING] Metrics:', metrics);

  return (
    <div className="min-h-screen gradient-bg">
      <Header userId={userId} setUserId={setUserId} userType="partner" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Title with Tier Badge and Timeframe Selector */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold">Partner Portal</h1>
            <div className={`px-3 py-1 rounded-full border ${getTierBadgeColor(partner.tier)}`}>
              {partner.tier.toUpperCase()}
            </div>
          </div>
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="px-3 py-2 rounded-md bg-white/10 border border-white/20 text-sm w-fit"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
        </div>
        {/* Technical Support Card */}
        <div className="mb-6">
          <TechnicalSupportCard />
        </div>

        {/* Partner Info Card */}
        <Card className="glass mb-6">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold mb-1">{partner.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {partner.model.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Partnership
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">
                  {partner.equityPercentage.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">Total Equity</p>
                <p className="text-xs text-green-500 mt-1">
                  {partner.equityVested.toFixed(2)}% vested
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <h3 className="text-2xl font-bold">${metrics.totalRevenue.toLocaleString()}</h3>
                  <p className="text-xs text-green-500 mt-1">
                    Your share: ${metrics.partnerShare.toLocaleString()}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Therapists</p>
                  <h3 className="text-2xl font-bold">{metrics.activeTherapists}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metrics.totalSessions} sessions
                  </p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Recurring Revenue</p>
                  <h3 className="text-2xl font-bold">${metrics.monthlyRecurringRevenue.toLocaleString()}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {partner.revenueShareRate}% share rate
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Minutes</p>
                  <h3 className="text-2xl font-bold">{metrics.totalMinutes.toLocaleString()}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Therapy time delivered
                  </p>
                </div>
                <Clock className="w-8 h-8 text-accent" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tier Progress Card */}
        <Card className="glass mb-6">
          <CardHeader>
            <CardTitle>Tier Progress</CardTitle>
            <CardDescription>
              Progress towards {metrics.nextTierName} tier
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Current: {partner.tier.toUpperCase()}</span>
                <span>{metrics.tierProgress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-primary to-purple-500 transition-all"
                  style={{ width: `${Math.min(100, metrics.tierProgress)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                MRR: ${metrics.monthlyRecurringRevenue.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for detailed views */}
        <Tabs value={selectedTab} onValueChange={async (val) => {
          console.log('🔄 [TAB CHANGE] Switching to tab:', val);
          setSelectedTab(val);
          await loadDashboard();
        }}>
          <TabsList className="grid w-full grid-cols-5 glass">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="therapists">Therapists</TabsTrigger>
            <TabsTrigger value="equity">Equity</TabsTrigger>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {revenueSummary.length > 0 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle>Revenue Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={revenueSummary}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" />
                      <YAxis stroke="rgba(255,255,255,0.5)" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#8b5cf6" name="Revenue" />
                      <Line type="monotone" dataKey="revenueShare" stroke="#10b981" name="Your Share" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Revenue Tab */}
          <TabsContent value="revenue" className="space-y-4">
            {/* Revenue Summary Chart */}
            {revenueSummary.length > 0 && (
              <Card className="glass">
                <CardHeader>
                  <CardTitle>Monthly Revenue Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={revenueSummary}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" />
                      <YAxis stroke="rgba(255,255,255,0.5)" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}
                      />
                      <Legend />
                      <Bar dataKey="revenue" fill="#8b5cf6" name="Total Revenue" />
                      <Bar dataKey="revenueShare" fill="#10b981" name="Your Share" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Recent Transactions */}
            <Card className="glass">
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Latest revenue transactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {revenueTransactions.map((trans) => (
                    <div key={trans.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                      <div>
                        <p className="font-medium">{trans.therapist}</p>
                        <p className="text-xs text-muted-foreground">
                          {trans.type.replace(/_/g, ' ')} • {new Date(trans.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">${trans.amount.toFixed(2)}</p>
                        <p className="text-xs text-green-500">
                          Your share: ${trans.partnerShare.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Therapists Tab */}
          <TabsContent value="therapists" className="space-y-4">
            <Card className="glass">
              <CardHeader>
                <CardTitle>Your Therapists</CardTitle>
                <CardDescription>{therapists.length} active therapists</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {therapists.map((therapist) => (
                    <div key={therapist.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                      <div>
                        <p className="font-medium">{therapist.therapistName}</p>
                        <p className="text-xs text-muted-foreground">{therapist.therapistEmail}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Joined: {new Date(therapist.attributionDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{therapist.totalSessions} sessions</p>
                        <p className="text-xs text-muted-foreground">{therapist.totalMinutes} minutes</p>
                        <p className="text-xs text-green-500">
                          ${therapist.lifetimeRevenue.toFixed(2)} revenue
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Equity Tab */}
          <TabsContent value="equity" className="space-y-4">
            {equityData && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="glass">
                    <CardContent className="p-6">
                      <div className="text-center">
                        <Award className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                        <h3 className="text-2xl font-bold">{equityData.equity.total.toFixed(2)}%</h3>
                        <p className="text-xs text-muted-foreground">Total Equity</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass">
                    <CardContent className="p-6">
                      <div className="text-center">
                        <Award className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        <h3 className="text-2xl font-bold">{equityData.equity.vested.toFixed(2)}%</h3>
                        <p className="text-xs text-muted-foreground">Vested</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass">
                    <CardContent className="p-6">
                      <div className="text-center">
                        <Award className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                        <h3 className="text-2xl font-bold">{equityData.equity.unvested.toFixed(2)}%</h3>
                        <p className="text-xs text-muted-foreground">Unvested</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="glass">
                  <CardHeader>
                    <CardTitle>Vesting Progress</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-6">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{equityData.equity.vestingProgress.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-3">
                        <div
                          className="h-3 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                          style={{ width: `${equityData.equity.vestingProgress}%` }}
                        />
                      </div>
                    </div>

                    {equityData.nextVesting && (
                      <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
                        <p className="font-medium mb-2">Next Vesting Event</p>
                        <p className="text-sm text-muted-foreground">
                          {equityData.nextVesting.amount.toFixed(2)}% vests in {equityData.nextVesting.daysUntil} days
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Date: {new Date(equityData.nextVesting.date).toLocaleDateString()}
                        </p>
                      </div>
                    )}

                    <div className="mt-6">
                      <h4 className="font-medium mb-3">Vesting Schedule</h4>
                      <div className="space-y-2">
                        {equityData.vestingSchedule.map((event: any) => (
                          <div
                            key={event.id}
                            className={`p-3 rounded-lg ${
                              event.status === 'vested' ? 'bg-green-500/10 border border-green-500/30' :
                              event.isPast ? 'bg-red-500/10 border border-red-500/30' :
                              'bg-white/5'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm font-medium">
                                  {new Date(event.date).toLocaleDateString()}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Status: {event.status}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold">{event.amount.toFixed(2)}%</p>
                                <p className="text-xs text-muted-foreground">
                                  Cumulative: {event.cumulative.toFixed(2)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Referrals Tab */}
          <TabsContent value="referrals" className="space-y-4">
            {referralData && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="glass">
                    <CardContent className="p-6">
                      <div className="text-center">
                        <UserPlus className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                        <h3 className="text-2xl font-bold">{referralData.referrals.totalReferrals}</h3>
                        <p className="text-xs text-muted-foreground">Total Referrals</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          L1: {referralData.referrals.level1Count} | L2: {referralData.referrals.level2Count}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass">
                    <CardContent className="p-6">
                      <div className="text-center">
                        <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        <h3 className="text-2xl font-bold">
                          ${referralData.referrals.totalMonthlyBonus.toFixed(2)}
                        </h3>
                        <p className="text-xs text-muted-foreground">Monthly Referral Bonus</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass">
                    <CardContent className="p-6">
                      <div className="text-center">
                        <Award className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                        <h3 className="text-2xl font-bold">
                          {referralData.referrals.networkBonusEquity.toFixed(2)}%
                        </h3>
                        <p className="text-xs text-muted-foreground">Network Bonus Equity</p>
                        {referralData.referrals.networkBonusEligible && (
                          <p className="text-xs text-green-500 mt-1">✓ Eligible</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="glass">
                  <CardHeader>
                    <CardTitle>Level 1 Referrals (Direct)</CardTitle>
                    <CardDescription>3% of their revenue</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {referralData.level1Partners.map((partner: any) => (
                        <div key={partner.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                          <div>
                            <p className="font-medium">{partner.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {partner.tier.toUpperCase()} • {partner.status}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">${partner.mrr.toFixed(2)}/mo</p>
                            <p className="text-xs text-green-500">
                              Your bonus: ${(partner.mrr * 0.03).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {referralData.level2Partners.length > 0 && (
                  <Card className="glass">
                    <CardHeader>
                      <CardTitle>Level 2 Referrals (Indirect)</CardTitle>
                      <CardDescription>1% of their revenue</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {referralData.level2Partners.map((partner: any) => (
                          <div key={partner.id} className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                            <div>
                              <p className="font-medium">{partner.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {partner.tier.toUpperCase()} • {partner.status}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold">${partner.mrr.toFixed(2)}/mo</p>
                              <p className="text-xs text-green-500">
                                Your bonus: ${(partner.mrr * 0.01).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}