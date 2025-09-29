// Location: client/src/pages/dashboard.tsx
// VERSION WITH EMERGENCY BYPASS

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

  // EMERGENCY BYPASS CHECK
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const bypassMode = urlParams.get('bypass') === 'true';
    const forceType = urlParams.get('type');

    if (bypassMode || sessionStorage.getItem('bypassAuth') === 'true') {
      console.log('🚨 EMERGENCY BYPASS MODE ACTIVATED');

      // Get stored values or use defaults
      const bypassUserId = localStorage.getItem('userId') || '8317bdd5-bce0-4e72-bb3c-72dc378da7ce';
      const bypassUserType = forceType || localStorage.getItem('userType') || 'therapist';

      console.log('Bypass UserId:', bypassUserId);
      console.log('Bypass UserType:', bypassUserType);

      setUserId(bypassUserId);
      setUserType(bypassUserType);
      setLoading(false);
      setMessage(null);

      // Clear URL params but keep session
      window.history.replaceState({}, document.title, '/dashboard');
      return;
    }

    // Normal auth flow continues below...
    normalAuthFlow();
  }, []);

  const normalAuthFlow = async () => {
    // Your existing ensureUserProfile and auth check code
    const checkAuthStatus = async () => {
      try {
        setDebugInfo('Starting auth check...');

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

        // Special handling for therapist email
        if (session.user.email === 'mathew@ivasa.ai') {
          console.log('🎯 Therapist email detected - using simplified flow');

          // Just set the values directly
          const therapistId = '8317bdd5-bce0-4e72-bb3c-72dc378da7ce';

          setUserId(therapistId);
          setUserType('therapist');
          localStorage.setItem('userId', therapistId);
          localStorage.setItem('userType', 'therapist');

          setLoading(false);
          setMessage(null);
          return;
        }

        // For other users, continue with normal profile check
        const profileId = await ensureUserProfile(session);
        if (profileId) {
          setUserId(profileId);
          setMessage(null);
          setDebugInfo('');
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
        // Special handling for therapist
        if (session.user.email === 'mathew@ivasa.ai') {
          const therapistId = '8317bdd5-bce0-4e72-bb3c-72dc378da7ce';
          setUserId(therapistId);
          setUserType('therapist');
          setLoading(false);
          return;
        }

        const profileId = await ensureUserProfile(session);
        if (profileId) {
          setUserId(profileId);
          setMessage(null);
          setDebugInfo('');
        }
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  };

  const ensureUserProfile = async (session: any) => {
    // Your existing ensureUserProfile code
    // ... (keep as is from your current implementation)
    return session?.user?.id || null;
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
          <p className="text-xs mt-2 text-muted-foreground">
            Stuck? Run emergency bypass in console
          </p>
        </div>
      </div>
    );
  }

  // Show auth if no user
  if (!userId) {
    return <Authentication setUserId={setUserId} />;
  }

  // Route based on user type
  console.log('🎯 Routing to dashboard for type:', userType);
  console.log('UserId:', userId);

  switch(userType) {
    case 'therapist':
      console.log('Loading TherapistDashboard...');
      return <TherapistDashboard userId={userId} setUserId={setUserId} />;
    case 'client':
      console.log('Loading ClientDashboard...');
      return <ClientDashboard userId={userId} setUserId={setUserId} />;
    default:
      console.log('Loading VoiceInterface...');
      return <VoiceInterface userId={userId} setUserId={setUserId} />;
  }
}