// Location: client/src/pages/influencer-dashboard.tsx
// Influencer dashboard with commission tracking and analytics

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { handleLogout } from '@/lib/auth-helpers';
import { supabase } from '@/lib/supabaseClient';
import { Link } from 'wouter';
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Eye, 
  MousePointerClick, 
  Share2,
  FileText,
  Award,
  Link as LinkIcon,
  Copy,
  Check,
  HelpCircle
} from 'lucide-react';

interface InfluencerDashboardProps {
  userId: string;
  setUserId: (id: string | null) => void;
}

export default function InfluencerDashboard({ userId, setUserId }: InfluencerDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Dashboard data
  const [influencer, setInfluencer] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [content, setContent] = useState<any[]>([]);
  const [conversions, setConversions] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any>(null);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [commissionSummary, setCommissionSummary] = useState<any[]>([]);

  const [copied, setCopied] = useState(false);
  const [timeframe, setTimeframe] = useState('30');
  const viewAsData = sessionStorage.getItem('adminViewAs');
  const influencerId = viewAsData ? JSON.parse(viewAsData).influencerId : null;

  useEffect(() => {
    loadDashboardData();
  }, [timeframe]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = session.access_token;
      const influencerParam = influencerId ? `&influencerId=${influencerId}` : '';

      // Load dashboard overview
      const dashboardRes = await fetch(`/api/influencer/dashboard?timeframe=${timeframe}${influencerParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (dashboardRes.ok) {
        const data = await dashboardRes.json();
        setInfluencer(data.influencer);
        setMetrics(data.metrics);
      }

      // Load content
      const contentRes = await fetch(`/api/influencer/content?limit=10${influencerParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (contentRes.ok) {
        const data = await contentRes.json();
        setContent(data.content || []);
      }

      // Load conversions
      const conversionsRes = await fetch(`/api/influencer/conversions?limit=20${influencerParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (conversionsRes.ok) {
        const data = await conversionsRes.json();
        setConversions(data.conversions || []);
      }

      // Load commissions
      const commissionsRes = await fetch(`/api/influencer/commissions?limit=20${influencerParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (commissionsRes.ok) {
        const data = await commissionsRes.json();
        setCommissions(data.transactions || []);
      }

      // Load referrals
      const referralsRes = await fetch(`/api/influencer/referrals${influencerId ? `?influencerId=${influencerId}` : ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (referralsRes.ok) {
        const data = await referralsRes.json();
        setReferrals(data.referrals);
      }

      // Load performance analytics
      const performanceRes = await fetch(`/api/influencer/analytics/performance?months=6${influencerParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (performanceRes.ok) {
        const data = await performanceRes.json();
        setPerformanceData(data.performanceData || []);
      }

      // Load commission summary
      const summaryRes = await fetch(`/api/influencer/commissions/summary?period=monthly&months=6${influencerParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setCommissionSummary(data.summary || []);
      }

    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2 
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              Influencer Dashboard
            </h1>
            <p className="text-muted-foreground">
              {influencer?.name} (@{influencer?.handle})
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
            <Link href="/faq">
              <Button 
                variant="outline" 
                data-testid="button-faq"
                className="bg-white/10 backdrop-blur-sm border-white/20"
              >
                <HelpCircle className="w-4 h-4 mr-2" />
                FAQ
              </Button>
            </Link>
            <Button 
              variant="outline" 
              onClick={() => handleLogout(setUserId)}
              className="bg-white/10 backdrop-blur-sm border-white/20"
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics?.totalEarnings || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">Last {timeframe} days</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Active Conversions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.activeSubscriptions || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics?.totalConversions || 0} total conversions
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Conversion Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.conversionRate || 0}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics?.totalClicks || 0} clicks tracked
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Total Reach
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(metrics?.totalViews || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatNumber(influencer?.followerCount || 0)} followers
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Promo Code & Link Section */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              Your Tracking Links
            </CardTitle>
            <CardDescription>Share these with your audience to track conversions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Promo Code</label>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-3 rounded-lg bg-white/5 border border-white/10 font-mono">
                  {influencer?.promoCode || 'N/A'}
                </div>
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(influencer?.promoCode || '')}
                  className="bg-white/10"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Referral Link</label>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-3 rounded-lg bg-white/5 border border-white/10 font-mono text-sm truncate">
                  {influencer?.referralLink || 'N/A'}
                </div>
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(influencer?.referralLink || '')}
                  className="bg-white/10"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div>
                <p className="text-sm font-medium">Commission Rate</p>
                <p className="text-xs text-muted-foreground">Per conversion</p>
              </div>
              <Badge variant="secondary" className="text-lg px-4 py-1">
                {influencer?.commissionRate || 0}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="glass-card w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="conversions">Conversions</TabsTrigger>
            <TabsTrigger value="commissions">Commissions</TabsTrigger>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Earnings Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                {commissionSummary.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={commissionSummary}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                      <XAxis dataKey="date" stroke="#ffffff60" />
                      <YAxis stroke="#ffffff60" />
                      <Tooltip 
                        contentStyle={{ background: '#1a1a2e', border: '1px solid #ffffff20', borderRadius: '8px' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="totalEarnings" stroke="#8b5cf6" strokeWidth={2} name="Total Earnings" />
                      <Line type="monotone" dataKey="commission" stroke="#10b981" strokeWidth={2} name="Commission" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No earnings data yet</p>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                {performanceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={performanceData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                      <XAxis dataKey="month" stroke="#ffffff60" />
                      <YAxis stroke="#ffffff60" />
                      <Tooltip 
                        contentStyle={{ background: '#1a1a2e', border: '1px solid #ffffff20', borderRadius: '8px' }}
                      />
                      <Legend />
                      <Bar dataKey="conversions" fill="#8b5cf6" name="Conversions" />
                      <Bar dataKey="clicks" fill="#3b82f6" name="Clicks" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">No performance data yet</p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Tier Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Current Tier</span>
                    <Badge variant="secondary" className="text-sm capitalize">
                      {influencer?.tier || 'nano'}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Progress to {metrics?.nextTierName}</span>
                      <span className="text-sm font-medium">{Math.round(metrics?.tierProgress || 0)}%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                        style={{ width: `${metrics?.tierProgress || 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/10">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Followers</span>
                      <span className="font-medium">{formatNumber(influencer?.followerCount || 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Recent Content
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {content.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium capitalize truncate">{item.type}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatNumber(item.views)} views • {item.conversions} conversions
                          </p>
                        </div>
                        <Badge variant={item.approvalStatus === 'approved' ? 'default' : 'secondary'}>
                          {item.approvalStatus}
                        </Badge>
                      </div>
                    ))}
                    {content.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No content tracked yet
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Content Tab */}
          <TabsContent value="content">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Content Performance</CardTitle>
                <CardDescription>Track your promotional content and engagement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {content.map((item) => (
                    <div key={item.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="capitalize">{item.type}</Badge>
                            <Badge variant={item.approvalStatus === 'approved' ? 'default' : 'secondary'}>
                              {item.approvalStatus}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">
                            Posted {new Date(item.postDate).toLocaleDateString()}
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground">Views</p>
                              <p className="text-sm font-medium">{formatNumber(item.views)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Engagement</p>
                              <p className="text-sm font-medium">{item.engagementRate}%</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Clicks</p>
                              <p className="text-sm font-medium">{item.clicks}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Conversions</p>
                              <p className="text-sm font-medium">{item.conversions}</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Commission</p>
                          <p className="text-xl font-bold text-green-500">{formatCurrency(item.commission)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {content.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No content tracked yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Conversions Tab */}
          <TabsContent value="conversions">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>User Conversions</CardTitle>
                <CardDescription>Users who signed up through your links</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {conversions.map((conversion) => (
                    <div key={conversion.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium">{conversion.userName}</p>
                          <p className="text-sm text-muted-foreground">{conversion.userEmail}</p>
                          <div className="flex gap-4 mt-2">
                            <Badge variant="outline" className="capitalize">
                              {conversion.subscriptionTier}
                            </Badge>
                            {conversion.promoCodeUsed && (
                              <span className="text-xs text-muted-foreground">
                                Code: {conversion.promoCodeUsed}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Commission Earned</p>
                          <p className="text-lg font-bold text-green-500">
                            {formatCurrency(conversion.totalCommission)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {conversion.daysSinceConversion} days ago
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {conversions.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No conversions yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Commission History</CardTitle>
                <CardDescription>Your earnings breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {commissions.map((transaction) => (
                    <div key={transaction.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="capitalize">
                              {transaction.type.replace('_', ' ')}
                            </Badge>
                            {transaction.paidToInfluencer && (
                              <Badge variant="default">Paid</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {new Date(transaction.date).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {transaction.userEmail} • {transaction.subscriptionTier}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(transaction.amount)} × {transaction.commissionRate}%
                          </p>
                          <p className="text-xl font-bold text-green-500">
                            {formatCurrency(transaction.commission)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {commissions.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No commissions yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Referrals Tab */}
          <TabsContent value="referrals">
            <div className="space-y-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Share2 className="h-5 w-5" />
                    Referral Network
                  </CardTitle>
                  <CardDescription>Earn bonuses by referring other influencers</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                      <p className="text-sm text-muted-foreground mb-1">Total Referrals</p>
                      <p className="text-2xl font-bold">{referrals?.totalReferrals || 0}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                      <p className="text-sm text-muted-foreground mb-1">Monthly Bonus</p>
                      <p className="text-2xl font-bold text-green-500">
                        {formatCurrency(referrals?.totalMonthlyBonus || 0)}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                      <p className="text-sm text-muted-foreground mb-1">Network Bonus</p>
                      <p className="text-2xl font-bold">
                        {referrals?.networkBonusEligible ? '+0.1% Equity' : 'Not Eligible'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {referrals?.networkBonusEligible ? 'Unlocked!' : 'Refer 5+ influencers'}
                      </p>
                    </div>
                  </div>

                  {referrals?.level1Referrals && referrals.level1Referrals.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium">Level 1 Referrals (3% bonus)</h3>
                      {referrals.level1Referrals.map((ref: any) => (
                        <div key={ref.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium">{ref.name}</p>
                              <p className="text-sm text-muted-foreground">
                                @{ref.handle} • {ref.platform}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-green-500">
                                {formatCurrency(ref.bonusEarned)}
                              </p>
                              <Badge variant="outline">{ref.status}</Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(!referrals?.level1Referrals || referrals.level1Referrals.length === 0) && (
                    <p className="text-center text-muted-foreground py-8">
                      No referrals yet. Share your unique link to start earning bonuses!
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}