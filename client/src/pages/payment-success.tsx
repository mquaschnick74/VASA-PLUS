import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [userType, setUserType] = useState<string>('individual');

  useEffect(() => {
    const checkUserAndRedirect = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Get user profile to determine dashboard
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_type')
          .eq('id', user.id)
          .single();

        const type = profile?.user_type || 'individual';
        setUserType(type);

        // Redirect after 3 seconds
        setTimeout(() => {
          if (type === 'therapist') {
            setLocation('/therapist-dashboard');
          } else if (type === 'client') {
            setLocation('/client-dashboard');
          } else {
            setLocation('/home');
          }
        }, 3000);
      } else {
        // No user, go to login
        setLocation('/');
      }
    };

    checkUserAndRedirect();
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg px-4">
      <Card className="w-full max-w-md glass">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Thank you for subscribing to iVASA! Your subscription is now active.
          </p>
          <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Redirecting to your dashboard...</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}