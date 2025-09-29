// Location: client/src/pages/dashboard.tsx
// FIXED VERSION - Properly manages auth state without race conditions

import { useState, useEffect, useRef } from 'react';
import Authentication from '@/components/authentication';
import VoiceInterface from '@/components/voice-interface';
import ClientDashboard from '@/pages/client-dashboard';
import TherapistDashboard from '@/pages/therapist-dashboard';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userType, setUserType] = useState<string>('individual');
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const authListenerRef = useRef<any>(null);
  const mountedRef = useRef(true);

  const ensureUserProfile = async (session: any) => {
    const token = session.access_token;

    try {
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

        // Store user info
        localStorage.setItem('userId', user.id);
        localStorage.setItem('userEmail', user.email || session.user.email);

        // Get user profile to determine type
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_type, email')
          .eq('id', user.id)
          .single();

        if (profile) {
          const detectedType = profile.user_type || 'individual';
          console.log(`✅ Detected ${detectedType}: ${profile.email}`);

          // Only update state if component is still mounted
          if (mountedRef.current) {
            setUserType(detectedType);
            setUserEmail(profile.email);
          }
        }

        return user.id;
      } else {
        const errorText = await response.text();
        console.error('Profile API error:', response.status, errorText);
        setDebugInfo(prev => prev + '\nAPI Error: ' + errorText);
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
    mountedRef.current = true;

    const setupAuth = async () => {
      console.log('Setting up auth listener');

      try {
        // First check for existing session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setLoading(false);
          return;
        }

        if (session && session.user.email_confirmed_at) {
          console.log('Existing session found for:', session.user.email);

          const profileId = await ensureUserProfile(session);
          if (profileId && mountedRef.current) {
            setUserId(profileId);
            setMessage(null);
            setDebugInfo('');
          }
        } else {
          console.log('No active session. Please sign in.');
        }

        // Set up single auth listener with proper handling
        if (!authListenerRef.current) {
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state changed:', event, session?.user?.email);

            // Skip initial session to avoid duplicate processing
            if (event === 'INITIAL_SESSION') {
              return;
            }

            // Only process if component is still mounted
            if (!mountedRef.current) {
              return;
            }

            if (event === 'SIGNED_OUT') {
              // Check if this is an unexpected signout
              const storedEmail = localStorage.getItem('userEmail');
              if (storedEmail && storedEmail === 'mathew@ivasa.ai') {
                console.log('Unexpected signout - ignoring');
                // Don't clear state for therapist dashboard unexpected signouts
                return;
              }

              // Regular signout
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
              if (profileId && mountedRef.current) {
                setUserId(profileId);
                setMessage(null);
                setDebugInfo('');
              }
              setLoading(false);
            }
          });

          authListenerRef.current = subscription;
        }
      } catch (error) {
        console.error('Auth setup error:', error);
        setMessage('Authentication error. Check console for details.');
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    setupAuth();

    // Cleanup
    return () => {
      mountedRef.current = false;
      if (authListenerRef.current) {
        authListenerRef.current.unsubscribe();
        authListenerRef.current = null;
      }
    };
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
          <button 
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.reload();
            }}
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

  // Route based on user type
  console.log(`📍 Routing to dashboard: {type: '${userType}', userId: '${userId}', email: '${userEmail}'}`);

  switch(userType) {
    case 'therapist':
      console.log('✅ Routing to Therapist Dashboard');
      return <TherapistDashboard userId={userId} setUserId={setUserId} />;
    case 'client':
      console.log('✅ Routing to Client Dashboard');
      return <ClientDashboard userId={userId} setUserId={setUserId} />;
    default:
      console.log('✅ Routing to Voice Interface');
      return <VoiceInterface userId={userId} setUserId={setUserId} />;
  }
}