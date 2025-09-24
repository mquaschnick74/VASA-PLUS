// Location: client/src/pages/dashboard.tsx

import { useState, useEffect } from 'react';
import Authentication from '@/components/authentication';
import VoiceInterface from '@/components/voice-interface';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Monitor auth state changes
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setLoading(false);
          return;
        }

        let currentSession = session;

        // If no session, try to refresh
        if (!currentSession) {
          const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
          currentSession = refreshedSession;
        }

        if (currentSession?.user) {
          console.log('Session user:', currentSession.user.email);

          // Check if this is an email confirmation redirect
          const isEmailConfirmed = window.location.hash.includes('confirmed=true');
          if (isEmailConfirmed) {
            // Clear the hash
            window.history.replaceState(null, '', window.location.pathname);
          }

          // Get the auth token
          const token = currentSession.access_token;

          // Try to create or get user profile directly - NO CHECK ENDPOINT
          console.log('Creating/getting user profile for:', currentSession.user.email);

          const profileResponse = await fetch('/api/auth/user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              email: currentSession.user.email,
              authUserId: currentSession.user.id,
              firstName: currentSession.user.user_metadata?.first_name
            })
          });

          // Handle 401 - sign out and reset
          if (profileResponse.status === 401) {
            console.log('Got 401 - User not authorized, signing out');
            await supabase.auth.signOut();
            localStorage.removeItem('userId');
            setUserId(null);
            setLoading(false);
            return;
          }

          if (!profileResponse.ok) {
            console.error('Profile creation failed:', profileResponse.status);
            if (isEmailConfirmed) {
              alert('Failed to create your profile after email confirmation. Please try signing in again.');
            }
            // Sign out on any profile creation failure
            await supabase.auth.signOut();
            localStorage.removeItem('userId');
            setUserId(null);
            setLoading(false);
            return;
          }

          const profileData = await profileResponse.json();

          if (profileData.user?.id) {
            console.log('Profile created/retrieved successfully:', profileData.user.email);
            localStorage.setItem('userId', profileData.user.id);
            setUserId(profileData.user.id);
          } else {
            console.error('No user ID in profile response');
            await supabase.auth.signOut();
            setUserId(null);
          }
        } else {
          // No session
          setUserId(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
        // On any error, sign out and reset
        await supabase.auth.signOut();
        localStorage.removeItem('userId');
        setUserId(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('userId');
        setUserId(null);
        setLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Re-check auth status on sign in
        await checkAuthStatus();
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
          <p className="text-muted-foreground">Loading...</p>
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