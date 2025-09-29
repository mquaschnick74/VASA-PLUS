// Location: client/src/pages/dashboard.tsx
// FIXED: Stores email BEFORE routing check

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

  const ensureUserProfile = async (session: any) => {
    const token = session.access_token;

    try {
      const apiUrl = '/api/auth/user';
      console.log('Calling API:', apiUrl);

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

      if (response.ok) {
        const responseData = await response.json();
        const { user, userProfile } = responseData;

        console.log('User received from API:', user);

        // CRITICAL: Store email IMMEDIATELY
        localStorage.setItem('userId', user.id);
        localStorage.setItem('userEmail', user.email);

        // Determine user type
        let determinedType = 'individual';

        if (user.email === 'mathew@ivasa.ai') {
          determinedType = 'therapist';
          console.log('✅ Detected therapist: mathew@ivasa.ai');
        } else if (userProfile?.user_type === 'therapist') {
          determinedType = 'therapist';
          console.log('✅ Detected therapist from profile');
        } else if (userProfile?.user_type === 'client' && userProfile?.invited_by) {
          determinedType = 'client';
          console.log('✅ Client with therapist detected');
        } else {
          determinedType = 'individual';
          console.log('✅ Individual user:', user.email);
        }

        setUserType(determinedType);
        localStorage.setItem('userType', determinedType);

        console.log('User type set to:', determinedType);

        return user.id;
      } else {
        const errorText = await response.text();
        console.error('Profile API error:', response.status, errorText);
        setMessage(`API Error (${response.status})`);
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Profile operation failed:', error);
      setMessage(`Connection error: ${errorMessage}`);
      return null;
    }
  };

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setMessage('Supabase connection error');
          setLoading(false);
          return;
        }

        if (!session) {
          console.log('No active session. Please sign in.');
          setLoading(false);
          return;
        }

        console.log('Session found:', session.user.email);

        // Store email from session as backup
        localStorage.setItem('sessionEmail', session.user.email);

        // Check if user is verified
        if (!session.user.email_confirmed_at) {
          setMessage('Please verify your email before continuing');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        // Ensure profile exists
        const profileId = await ensureUserProfile(session);
        if (profileId) {
          setUserId(profileId);
          setMessage(null);
        }
        setLoading(false);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Auth check error:', error);
        setMessage(`Authentication error: ${errorMessage}`);
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
        setUserType('individual');
        setLoading(false);
      } else if (event === 'SIGNED_IN' && session) {
        // Store email immediately
        localStorage.setItem('sessionEmail', session.user.email);

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
          <div className="space-y-2">
            <button 
              onClick={() => window.location.reload()}
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
  const email = localStorage.getItem('userEmail') || localStorage.getItem('sessionEmail');

  console.log('📍 Routing to dashboard:', {
    type: userType,
    userId: userId,
    email: email
  });

  // Check if therapist
  if (userType === 'therapist' || email === 'mathew@ivasa.ai') {
    console.log('✅ Routing to Therapist Dashboard');
    return <TherapistDashboard userId={userId} setUserId={setUserId} />;
  }

  // Check if client
  if (userType === 'client' && localStorage.getItem('invited_by')) {
    console.log('✅ Routing to Client Dashboard');
    return <ClientDashboard userId={userId} setUserId={setUserId} />;
  }

  // Default to Voice Interface
  console.log('✅ Routing to Voice Interface');
  return <VoiceInterface userId={userId} setUserId={setUserId} />;
}