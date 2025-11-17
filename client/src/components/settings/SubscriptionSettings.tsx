// Location: client/src/components/settings/SubscriptionSettings.tsx
// Subscription and billing settings for users with subscriptions

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SubscriptionStatus from '../SubscriptionStatus';
import { CreditCard, FileText, TrendingUp } from 'lucide-react';

interface SubscriptionSettingsProps {
  userId: string;
  userType: string;
}

interface UsageStats {
  minutes_used: number;
  minutes_limit: number;
  minutes_remaining: number;
  sessions_this_month: number;
}

export default function SubscriptionSettings({ userId, userType }: SubscriptionSettingsProps) {
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsageStats = async () => {
      if (!userId) return;

      try {
        const response = await fetch(`/api/subscription/status/${userId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!response.ok) throw new Error('Failed to fetch usage stats');

        const data = await response.json();

        setUsageStats({
          minutes_used: data.limits?.minutes_used || 0,
          minutes_limit: data.limits?.minutes_limit || 0,
          minutes_remaining: data.limits?.minutes_remaining || 0,
          sessions_this_month: data.sessionCount || 0,
        });
      } catch (error) {
        console.error('Error fetching usage stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsageStats();
  }, [userId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Subscription & Billing</h2>
        <p className="text-muted-foreground text-sm">
          Manage your subscription, billing, and usage
        </p>
      </div>

      {/* Subscription Status Card */}
      <div>
        <SubscriptionStatus userId={userId} />
      </div>

      {/* Usage Statistics Card */}
      {!loading && usageStats && (
        <Card className="glass border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              Usage Statistics
            </CardTitle>
            <CardDescription>
              Track your subscription usage and limits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Minutes Used
                </label>
                <p className="text-2xl font-bold text-emerald-500">
                  {usageStats.minutes_used.toFixed(1)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Minutes Remaining
                </label>
                <p className="text-2xl font-bold text-blue-500">
                  {usageStats.minutes_remaining.toFixed(1)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Total Limit
                </label>
                <p className="text-2xl font-bold">
                  {usageStats.minutes_limit.toFixed(1)}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Sessions This Month
                </label>
                <p className="text-2xl font-bold">
                  {usageStats.sessions_this_month}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Usage Progress</span>
                <span className="font-medium">
                  {usageStats.minutes_limit > 0
                    ? Math.round((usageStats.minutes_used / usageStats.minutes_limit) * 100)
                    : 0}%
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
                  style={{
                    width: `${usageStats.minutes_limit > 0
                      ? Math.min((usageStats.minutes_used / usageStats.minutes_limit) * 100, 100)
                      : 0}%`
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing Information Placeholder */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-500" />
            Billing Information
          </CardTitle>
          <CardDescription>
            Manage payment methods and billing details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the "Manage Subscription" button above to access the Stripe Customer Portal where you can:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
            <li>Update payment methods</li>
            <li>View billing history</li>
            <li>Download invoices</li>
            <li>Update billing information</li>
            <li>Cancel or change your subscription</li>
          </ul>
        </CardContent>
      </Card>

      {/* Invoices Placeholder */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-500" />
            Recent Invoices
          </CardTitle>
          <CardDescription>
            View and download your billing history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Access your complete billing history and download invoices through the Stripe Customer Portal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
