import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabaseClient';
import { Clock, TrendingUp, AlertTriangle, Sparkles, Users } from 'lucide-react';
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
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!userId) return;

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/subscription/status/${userId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
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
      <Card className="glass">
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

  const usagePercentage = limits.minutes_limit > 0 
    ? (limits.minutes_used / limits.minutes_limit) * 100 
    : 0;

  const isLowUsage = usagePercentage >= 80;
  const isVeryLowUsage = usagePercentage >= 95;

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

      const response = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
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

  // Determine if user has a paid subscription (not trial)
  const hasPaidSubscription = limits && !limits.is_trial && limits.subscription_active;

  return (
    <Card className="glass">
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

        {/* Voice Minutes Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Voice Minutes</span>
            <span className="text-muted-foreground">
              {limits.minutes_remaining} / {limits.minutes_limit} min
            </span>
          </div>

          <Progress 
            value={usagePercentage} 
            className={`h-2 ${
              isVeryLowUsage ? 'bg-red-200' : 
              isLowUsage ? 'bg-yellow-200' : 
              'bg-gray-200'
            }`}
          />

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="w-3 h-3" />
            <span>{limits.minutes_used} minutes used</span>
          </div>
        </div>

        {/* Client Slots (Therapists Only) */}
        {limits.user_type === 'therapist' && limits.client_limit !== undefined && limits.client_limit > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Client Slots</span>
              <span className="text-muted-foreground">
                {limits.clients_used || 0} / {limits.client_limit} clients
              </span>
            </div>

            <Progress 
              value={limits.client_limit > 0 ? ((limits.clients_used || 0) / limits.client_limit) * 100 : 0} 
              className="h-2 bg-gray-200"
            />

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-3 h-3" />
              <span>{limits.client_limit - (limits.clients_used || 0)} slots available</span>
            </div>
          </div>
        )}

        {/* Warnings */}
        {isVeryLowUsage && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You've used {Math.round(usagePercentage)}% of your voice minutes. Upgrade to continue sessions.
            </AlertDescription>
          </Alert>
        )}

        {isLowUsage && !isVeryLowUsage && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You've used {Math.round(usagePercentage)}% of your voice minutes. Consider upgrading soon.
            </AlertDescription>
          </Alert>
        )}

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
        <div className="flex gap-2 pt-2">
          {hasPaidSubscription ? (
            <Button 
              className="w-full" 
              onClick={handleManageSubscription}
              disabled={portalLoading}
              data-testid="button-manage-subscription"
            >
              {portalLoading ? 'Loading...' : 'Manage Subscription'}
            </Button>
          ) : (
            <Button 
              className="w-full" 
              onClick={() => setLocation('/pricing')}
              data-testid="button-upgrade-plan"
            >
              Upgrade Plan
            </Button>
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