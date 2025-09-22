// Location: client/src/pages/confirm.tsx

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';  // Changed from useNavigate
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';

export default function ConfirmEmail() {
  const [, setLocation] = useLocation();  // Changed from navigate
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    handleEmailConfirmation();
  }, []);

  const handleEmailConfirmation = async () => {
    try {
      // Get the token from URL hash
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');

      if (type === 'signup' || type === 'email_change') {
        // Email confirmed successfully
        setStatus('success');
        setMessage('Email confirmed successfully! Redirecting to dashboard...');

        if (accessToken) {
          // Store the tokens
          localStorage.setItem('authToken', accessToken);

          // Get the user session
          const { data: { user } } = await supabase.auth.getUser(accessToken);

          if (user) {
            // Create or get user profile
            const response = await fetch('/api/auth/user', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify({
                email: user.email,
                authUserId: user.id
              })
            });

            if (response.ok) {
              const { user: dbUser } = await response.json();
              localStorage.setItem('userId', dbUser.id);
            }
          }
        }

        // Redirect after 2 seconds
        setTimeout(() => {
          setLocation('/dashboard');  // Changed from navigate
        }, 2000);
      } else if (type === 'recovery') {
        // Password reset flow
        setStatus('success');
        setMessage('Email verified! You can now set a new password.');

        // Store tokens and redirect to password reset page
        if (accessToken) {
          localStorage.setItem('resetToken', accessToken);
          setTimeout(() => {
            setLocation('/reset-password');  // Changed from navigate
          }, 2000);
        }
      } else {
        // Handle other confirmation types or errors
        setStatus('error');
        setMessage('Invalid confirmation link or link has expired.');
      }
    } catch (error) {
      console.error('Confirmation error:', error);
      setStatus('error');
      setMessage('An error occurred during confirmation. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-bg">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full glass-strong mb-6">
            <i className={`fas ${
              status === 'loading' ? 'fa-spinner fa-spin' : 
              status === 'success' ? 'fa-check text-green-500' : 
              'fa-times text-red-500'
            } text-3xl`}></i>
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {status === 'loading' ? 'Confirming Email...' : 
             status === 'success' ? 'Email Confirmed!' : 
             'Confirmation Failed'}
          </h1>
        </div>

        <Card className="glass rounded-2xl border-0">
          <CardContent className="p-8">
            <p className="text-center text-muted-foreground mb-6">
              {message}
            </p>

            {status === 'error' && (
              <div className="space-y-4">
                <Button
                  onClick={() => setLocation('/')}  // Changed from navigate
                  className="w-full bg-gradient-to-r from-primary to-accent py-3 rounded-xl"
                >
                  Go to Sign In
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  If you continue to have issues, please contact support.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}