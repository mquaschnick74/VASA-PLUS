import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabaseClient';
import { getApiUrl } from '@/lib/platform';
import { Clock, AlertTriangle, Sparkles, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useLocation } from 'wouter';

interface SubscriptionLimits {
  can_use_voice: boolean;
  minutes_remaining: number;
  minutes_used: number;
  minutes_limit: number;
  subscription_active: boolean;
  is_trial: boolean;
  trial_days_left: number;
  subscription_tier: string;
  user_type: string;
  client_limit?: number;
  clients_used?: number;
}

interface SubscriptionStatusProps {
  userId: string;
}

export default function SubscriptionStatus({ userId }: SubscriptionStatusProps) {
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!userId) return;

    const fetchStatus = async () => {
      try {
        // Get fresh Supabase session token
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) {
          console.error('❌ [SUBSCRIPTION-STATUS] No auth token available');
          setLoading(false);
          return;
        }

        const response = await fetch(getApiUrl(`/api/subscription/status/${userId}`), {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch subscription status');
        }

        const data = await response.json();
        
        // Merge subscription-level data into limits for display
        const enrichedLimits = {
          ...data.limits,
          client_limit: data.subscription?.client_limit || data.limits.client_limit || 0,
          clients_used: data.subscription?.clients_used || data.limits.clients_used || 0
        };
        
        setLimits(enrichedLimits);
      } catch (error) {
        console.error('Error fetching subscription status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  if (loading) {
    return (
      <Card className="glass" style={{ backgroundColor: 'hsl(271, 60%, 40%)' }}>
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!limits) {
    return null;
  }

  const getTierDisplay = (tier: string) => {
    const tierMap: Record<string, string> = {
      'trial': 'Free Trial',
      'basic': 'Basic',
      'premium': 'Premium',
      'plus': 'Plus'
    };
    return tierMap[tier] || tier;
  };

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        alert('Please sign in again to manage your subscription.');
        return;
      }

      const response = await fetch(getApiUrl('/api/stripe/create-portal-session'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to create portal session');
      }

      const { url } = await response.json();

      // Open Stripe customer portal in new tab
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error opening customer portal:', error);
      alert('Failed to open subscription management. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSyncSubscription = async () => {
    try {
      setSyncLoading(true);
      setSyncResult(null);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        setSyncResult({ success: false, message: 'Please sign in again to sync.' });
        return;
      }

      const response = await fetch(getApiUrl('/api/stripe/sync-subscription'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSyncResult({
          success: true,
          message: `Synced: ${data.subscription.tier} plan (${data.subscription.status})`
        });

        // Refresh the subscription status after sync
        const statusResponse = await fetch(`/api/subscription/status/${userId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const enrichedLimits = {
            ...statusData.limits,
            client_limit: statusData.subscription?.client_limit || statusData.limits.client_limit || 0,
            clients_used: statusData.subscription?.clients_used || statusData.limits.clients_used || 0
          };
          setLimits(enrichedLimits);
        }
      } else {
        setSyncResult({
          success: false,
          message: data.error || 'Failed to sync subscription'
        });
      }
    } catch (error) {
      console.error('Error syncing subscription:', error);
      setSyncResult({ success: false, message: 'Network error. Please try again.' });
    } finally {
      setSyncLoading(false);
    }
  };

  // Determine if user has a paid subscription (not trial)
  const hasPaidSubscription = limits && !limits.is_trial && limits.subscription_active;

  return (
    <Card className="glass" style={{ backgroundColor: 'hsl(271, 60%, 40%)' }}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Subscription Status</CardTitle>
          {limits.is_trial && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Trial
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Plan */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Current Plan</span>
            <Badge variant={limits.subscription_active ? "default" : "destructive"}>
              {getTierDisplay(limits.subscription_tier)}
            </Badge>
          </div>

          {limits.is_trial && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>
                {limits.trial_days_left > 0 
                  ? `${limits.trial_days_left} day${limits.trial_days_left !== 1 ? 's' : ''} left in trial`
                  : 'Trial expired'}
              </span>
            </div>
          )}
        </div>

        {/* Trial Expiring Warning */}
        {limits.is_trial && limits.trial_days_left <= 2 && limits.trial_days_left > 0 && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Your trial expires in {limits.trial_days_left} day{limits.trial_days_left !== 1 ? 's' : ''}. 
              Upgrade to continue using iVASA.
            </AlertDescription>
          </Alert>
        )}

        {/* Trial Expired */}
        {limits.is_trial && limits.trial_days_left <= 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Your trial has expired. Upgrade to continue using iVASA.
            </AlertDescription>
          </Alert>
        )}

        {/* CTA Buttons */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex gap-2">
            {hasPaidSubscription ? (
              <Button
                className="flex-1"
                onClick={handleManageSubscription}
                disabled={portalLoading}
                data-testid="button-manage-subscription"
              >
                {portalLoading ? 'Loading...' : 'Manage Subscription'}
              </Button>
            ) : (
              <Button
                className="flex-1"
                onClick={() => setLocation('/pricing')}
                data-testid="button-upgrade-plan"
              >
                Upgrade Plan
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleSyncSubscription}
              disabled={syncLoading}
              title="Sync subscription from Stripe"
              data-testid="button-sync-subscription"
            >
              {syncLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Sync Result Message */}
          {syncResult && (
            <div className={`flex items-center gap-2 text-sm p-2 rounded ${
              syncResult.success
                ? 'bg-green-500/10 text-green-500'
                : 'bg-yellow-500/10 text-yellow-500'
            }`}>
              {syncResult.success ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{syncResult.message}</span>
            </div>
          )}
        </div>

        {/* Additional Info for Therapists */}
        {limits.user_type === 'therapist' && (
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Your clients share your subscription minutes.</p>
              <p>Upgrade to Premium for more client slots and voice time.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}