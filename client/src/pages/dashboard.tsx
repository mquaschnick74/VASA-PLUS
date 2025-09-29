// Location: client/src/pages/dashboard.tsx

import { useState, useEffect } from 'react';
import Authentication from '@/components/authentication';
import VoiceInterface from '@/components/voice-interface';
import ClientDashboard from '@/pages/client-dashboard';
import TherapistDashboard from '@/pages/therapist-dashboard';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userType, setUserType] = useState<string>('individual');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const ensureUserProfile = async (session: any) => {
    const token = session.access_token;

    try {
      // Use relative URL for API calls - this will work in both dev and production
      const apiUrl = '/api/auth/user';

      console.log('Calling API:', apiUrl);
      setDebugInfo(prev => prev + '\nCalling API: ' + apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: session.user.email,
          firstName: session.user.user_metadata?.first_name || session.user.email.split('@')[0],
          authUserId: session.user.id,
          userType: session.user.user_metadata?.user_type || 'individual'
        })
      });

      console.log('API Response status:', response.status);
      setDebugInfo(prev => prev + '\nAPI Response: ' + response.status);

      if (response.ok) {
        const { user } = await response.json();
        console.log('User received from API:', user);
        localStorage.setItem('userId', user.id);

        // Try to get user profile to determine type
        try {
          console.log('Fetching user profile for ID:', user.id);
          setDebugInfo(prev => prev + '\nFetching profile for: ' + user.id);

          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('user_type')
            .eq('id', user.id)
            .single();

          console.log('Profile query result:', { profile, error: profileError });
          setDebugInfo(prev => prev + '\nProfile result: ' + JSON.stringify(profile || profileError));

          if (profileError) {
            console.warn('Profile fetch error (non-fatal):', profileError);
            // Don't fail - use default or user metadata
            const fallbackType = session.user.user_metadata?.user_type || 
                               user.role === 'therapist' ? 'therapist' : 'individual';
            console.log('Using fallback user type:', fallbackType);
            setUserType(fallbackType);
          } else if (profile) {
            console.log('Setting user type from profile:', profile.user_type);
            setUserType(profile.user_type || 'individual');
          } else {
            console.log('No profile found, using default type');
            setUserType('individual');
          }
        } catch (profileErr) {
          console.warn('Error fetching profile (non-fatal):', profileErr);
          setDebugInfo(prev => prev + '\nProfile error (non-fatal): ' + profileErr.message);
          // Don't fail the entire auth - just use default type
          const fallbackType = session.user.user_metadata?.user_type || 'individual';
          setUserType(fallbackType);
        }

        return user.id;
      } else {
        const errorText = await response.text();
        console.error('Profile API error:', response.status, errorText);
        setDebugInfo(prev => prev + '\nAPI Error: ' + errorText);

        // Don't immediately sign out - let user see the error
        setMessage(`API Error (${response.status}): ${errorText.substring(0, 100)}`);
        return null;
      }
    } catch (error) {
      console.error('Profile operation failed:', error);
      setDebugInfo(prev => prev + '\nFetch Error: ' + error.message);
      setMessage(`Connection error: ${error.message}`);
      return null;
    }
  };

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        setDebugInfo('Starting auth check...');

        // Check for email confirmation in URL
        const urlParams = new URLSearchParams(window.location.search);
        const isConfirming = urlParams.has('type') && urlParams.get('type') === 'signup';

        if (isConfirming) {
          setMessage('Email confirmed! Setting up your account...');
        }

        // First, just check if Supabase is working
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setDebugInfo(prev => prev + '\nSupabase Error: ' + sessionError.message);
          setMessage('Supabase connection error. Check console for details.');
          setLoading(false);
          return;
        }

        if (!session) {
          console.log('No session found');
          setDebugInfo(prev => prev + '\nNo session found');
          setLoading(false);
          return;
        }

        // We have a session
        console.log('Session found for:', session.user.email);
        setDebugInfo(prev => prev + '\nSession found: ' + session.user.email);

        // Check if user is verified
        if (!session.user.email_confirmed_at) {
          setMessage('Please verify your email before continuing');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        // Try to ensure profile exists
        const profileId = await ensureUserProfile(session);
        if (profileId) {
          setUserId(profileId);
          setMessage(null);
          setDebugInfo(''); // Clear debug info on success

          // Check if this is a therapist based on email (fallback)
          if (session.user.email === 'mathew@ivasa.ai') {
            console.log('Detected therapist email, setting type to therapist');
            setUserType('therapist');
          }
        }
        setLoading(false);

      } catch (error) {
        console.error('Auth check error:', error);
        setDebugInfo(prev => prev + '\nAuth Error: ' + error.message);
        setMessage('Authentication error. Check console for details.');
        setLoading(false);
      }
    };

    checkAuthStatus();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      if (event === 'SIGNED_OUT') {
        localStorage.clear();
        sessionStorage.clear();
        setUserId(null);
        setLoading(false);
      } else if (event === 'SIGNED_IN' && session) {
        if (!session.user.email_confirmed_at) {
          setMessage('Please verify your email to continue');
          await supabase.auth.signOut();
          setUserId(null);
          setLoading(false);
          return;
        }

        const profileId = await ensureUserProfile(session);
        if (profileId) {
          setUserId(profileId);
          setMessage(null);
          setDebugInfo(''); // Clear debug info on success

          // Check if this is a therapist based on email (fallback)
          if (session.user.email === 'mathew@ivasa.ai') {
            console.log('Detected therapist email, setting type to therapist');
            setUserType('therapist');
          }
        }
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
          {debugInfo && (
            <pre className="mt-4 text-xs text-left max-w-md mx-auto bg-black/20 p-2 rounded">
              {debugInfo}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // Show message if exists but no user
  if (message && !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center max-w-md">
          <p className="text-lg mb-4">{message}</p>
          {debugInfo && (
            <pre className="mb-4 text-xs text-left bg-black/20 p-2 rounded">
              {debugInfo}
            </pre>
          )}
          <div className="space-y-2">
            <button 
              onClick={() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              className="text-primary hover:underline block w-full"
            >
              Refresh Page
            </button>
            <button 
              onClick={async () => {
                await supabase.auth.signOut();
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              className="text-primary hover:underline block w-full"
            >
              Sign Out & Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show auth if no user
  if (!userId) {
    return <Authentication setUserId={setUserId} />;
  }

  // Route based on user type
  console.log('Routing to dashboard for type:', userType);
  switch(userType) {
    case 'therapist':
      return <TherapistDashboard userId={userId} setUserId={setUserId} />;
    case 'client':
      return <ClientDashboard userId={userId} setUserId={setUserId} />;
    default:
      return <VoiceInterface userId={userId} setUserId={setUserId} />;
  }
}