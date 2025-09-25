// Location: client/src/pages/dashboard.tsx

import { useState, useEffect } from 'react';
import Authentication from '@/components/authentication';
import VoiceInterface from '@/components/voice-interface';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const handleSignedIn = async (session: any) => {
    localStorage.setItem('authToken', session.access_token);

    // ALWAYS use the auth user ID - don't create separate profile IDs
    const authUserId = session.user.id;
    
    // Check if profile exists for this auth user
    const response = await fetch('/api/auth/user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        email: session.user.email,
        authUserId: authUserId
      })
    });

    if (response.ok) {
      // Use the auth user ID directly - don't use a different database ID
      setUserId(authUserId);
      localStorage.setItem('userId', authUserId);
    }
  };

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // Check for email confirmation in URL
        const urlParams = new URLSearchParams(window.location.search);
        const isConfirming = urlParams.has('type') && urlParams.get('type') === 'signup';

        if (isConfirming) {
          setMessage('Email confirmed! Setting up your account...');
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setLoading(false);
          return;
        }

        if (!session) {
          // Try to refresh session
          const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();

          if (!refreshedSession) {
            setLoading(false);
            return;
          }

          // Use refreshed session
          await handleSignedIn(refreshedSession);
          setMessage(null);
        } else {
          // Check if user is verified
          if (!session.user.email_confirmed_at) {
            setMessage('Please verify your email before continuing');
            await supabase.auth.signOut();
            setLoading(false);
            return;
          }

          // Ensure profile exists
          await handleSignedIn(session);
          setMessage(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setMessage('An error occurred. Please try signing in again.');
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      if (event === 'SIGNED_OUT') {
        localStorage.clear();
        setUserId(null);
        setLoading(false);
      } else if (event === 'SIGNED_IN' && session) {
        // Dual auth check - ensure email is verified
        if (!session.user.email_confirmed_at) {
          setMessage('Please verify your email to continue');
          await supabase.auth.signOut();
          setUserId(null);
          setLoading(false);
          return;
        }

        // Create/get profile
        await handleSignedIn(session);
        setMessage(null);
        setLoading(false);
      } else if (event === 'USER_UPDATED' && session) {
        // Handle email confirmation
        if (session.user.email_confirmed_at) {
          await handleSignedIn(session);
          setMessage('Account verified successfully!');
          setTimeout(() => setMessage(null), 3000);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{message || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // Show message if exists but no user
  if (message && !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg mb-4">{message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="text-primary hover:underline"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  // Show auth if no user
  if (!userId) {
    return <Authentication setUserId={setUserId} />;
  }

  // Show voice interface
  return <VoiceInterface userId={userId} setUserId={setUserId} />;
}