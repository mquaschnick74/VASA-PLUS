// Location: client/src/pages/dashboard.tsx
// FIXED: Correct user type detection

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
        const { user } = await response.json();
        console.log('User received from API:', user);
        localStorage.setItem('userId', user.id);

        // CRITICAL FIX: Only set as therapist if EXPLICITLY a therapist
        let determinedType = 'individual'; // DEFAULT TO INDIVIDUAL

        if (user.email === 'mathew@ivasa.ai') {
          // ONLY mathew@ivasa.ai is a therapist
          determinedType = 'therapist';
          console.log('✅ Detected therapist: mathew@ivasa.ai');
        } else if (user.role === 'therapist' && user.email === 'mathew@ivasa.ai') {
          // Double check - only if both conditions match
          determinedType = 'therapist';
        } else if (user.role === 'client' || user.user_type === 'client') {
          determinedType = 'client';
          console.log('Detected client user');
        } else {
          // EVERYONE ELSE IS INDIVIDUAL
          determinedType = 'individual';
          console.log('Standard individual user:', user.email);
        }

        setUserType(determinedType);
        localStorage.setItem('userType', determinedType);
        console.log('User type set to:', determinedType);

        return user.id;
      } else {
        const errorText = await response.text();
        console.error('Profile API error:', response.status, errorText);
        setMessage(`API Error (${response.status}): ${errorText.substring(0, 100)}`);
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
    // NO MORE BYPASS MODE - Remove it entirely
    const checkAuthStatus = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setMessage('Supabase connection error: ' + sessionError.message);
          setLoading(false);
          return;
        }

        if (!session) {
          console.log('No active session. Please sign in.');
          setLoading(false);
          return;
        }

        console.log('✅ Session found:', { 
          email: session.user.email,
          userId: session.user.id
        });

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
  console.log('📍 Routing to dashboard:', {
    type: userType,
    userId: userId,
    email: localStorage.getItem('userEmail')
  });

  switch(userType) {
    case 'therapist':
      // ONLY show therapist dashboard for actual therapists
      if (localStorage.getItem('userEmail') === 'mathew@ivasa.ai' || 
          userId === '8317bdd5-bce0-4e72-bb3c-72dc378da7ce') {
        return <TherapistDashboard userId={userId} setUserId={setUserId} />;
      }
      // Otherwise fall through to voice interface
      console.warn('Non-therapist trying to access therapist dashboard, redirecting to voice interface');
      setUserType('individual');
      return <VoiceInterface userId={userId} setUserId={setUserId} />;

    case 'client':
      return <ClientDashboard userId={userId} setUserId={setUserId} />;

    default:
      return <VoiceInterface userId={userId} setUserId={setUserId} />;
  }
}