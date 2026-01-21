import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getApiUrl } from '@/lib/platform';

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [userType, setUserType] = useState<string>('individual');
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'success' | 'error' | 'idle'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);

  const syncSubscription = async () => {
    setIsSyncing(true);
    setSyncStatus('syncing');
    setSyncMessage('Syncing your subscription...');

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setSyncStatus('error');
        setSyncMessage('Please sign in to sync your subscription.');
        setIsSyncing(false);
        return false;
      }

      const response = await fetch(getApiUrl('/api/stripe/sync-subscription'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSyncStatus('success');
        setSyncMessage(`Subscription synced: ${data.subscription.tier} plan`);
        setIsSyncing(false);
        return true;
      } else {
        setSyncStatus('error');
        setSyncMessage(data.error || 'Failed to sync subscription. Please try again.');
        setIsSyncing(false);
        return false;
      }
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
      setSyncMessage('Network error. Please try again.');
      setIsSyncing(false);
      return false;
    }
  };

  useEffect(() => {
    const checkUserAndSync = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLocation('/');
        return;
      }

      // Get user profile to determine dashboard
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_type')
        .eq('email', user.email)
        .single();

      const type = profile?.user_type || 'individual';
      setUserType(type);

      // Wait a moment for webhook to process, then sync subscription
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to sync subscription (this will fix any webhook failures)
      const synced = await syncSubscription();

      // Redirect after sync attempt
      setTimeout(() => {
        if (type === 'therapist') {
          setLocation('/therapist-dashboard');
        } else if (type === 'client') {
          setLocation('/client-dashboard');
        } else {
          setLocation('/home');
        }
      }, synced ? 2000 : 5000); // Wait longer if sync failed so user can see message
    };

    checkUserAndSync();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg px-4">
      <Card className="w-full max-w-md glass">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              syncStatus === 'error'
                ? 'bg-yellow-100 dark:bg-yellow-900'
                : 'bg-green-100 dark:bg-green-900'
            }`}>
              {syncStatus === 'error' ? (
                <AlertCircle className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
              ) : (
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              )}
            </div>
          </div>
          <CardTitle className="text-2xl">
            {syncStatus === 'error' ? 'Almost There!' : 'Payment Successful!'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Thank you for subscribing to iVASA!
          </p>

          {/* Sync Status */}
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center space-x-2">
              {syncStatus === 'syncing' && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm text-blue-500">{syncMessage}</span>
                </>
              )}
              {syncStatus === 'success' && (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-500">{syncMessage}</span>
                </>
              )}
              {syncStatus === 'error' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-yellow-500">{syncMessage}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={syncSubscription}
                    disabled={isSyncing}
                    className="mt-2"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry Sync
                      </>
                    )}
                  </Button>
                </div>
              )}
              {syncStatus === 'idle' && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Preparing your subscription...</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Redirecting to your dashboard...</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}