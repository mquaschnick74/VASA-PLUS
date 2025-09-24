// Location: client/src/pages/dashboard.tsx

import { useState, useEffect } from 'react';
import Authentication from '@/components/authentication';
import VoiceInterface from '@/components/voice-interface';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      if (event === 'SIGNED_OUT') {
        setUserId(null);
        localStorage.clear();
      } else if (event === 'SIGNED_IN' && session) {
        await handleSignedIn(session);
      } else if (event === 'USER_UPDATED' && session) {
        // Handle user updates after email confirmation
        await handleSignedIn(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Check if we're coming from email confirmation
    const hash = window.location.hash;
    if (hash.includes('confirmed=true')) {
      // Clear the hash
      window.history.replaceState(null, '', window.location.pathname);

      // Force re-check auth status
      checkAuthStatus();
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Session error:', error);
        setLoading(false);
        return;
      }

      if (session) {
        await handleSignedIn(session);
      } else {
        // Check if there's a session being established from email confirmation
        const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
        if (refreshedSession) {
          await handleSignedIn(refreshedSession);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignedIn = async (session: any) => {
    try {
      localStorage.setItem('authToken', session.access_token);

      let storedUserId = localStorage.getItem('userId');
      if (storedUserId) {
        // Verify the stored user still exists
        const authToken = session.access_token;
        const verifyResponse = await fetch(`/api/auth/user-context/${storedUserId}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (verifyResponse.status === 404) {
          // User was deleted, clear storage and create new profile
          console.log('Stored user not found, creating new profile...');
          localStorage.removeItem('userId');
          storedUserId = null;
        } else if (verifyResponse.ok) {
          // User exists, use stored ID
          setUserId(storedUserId);
          return;
        }
      }

      if (!storedUserId) {
        // Fetch or create user profile
        const response = await fetch('/api/auth/user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            email: session.user.email,
            firstName: session.user.user_metadata?.first_name || session.user.email.split('@')[0],
            authUserId: session.user.id
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Profile creation error:', errorData);

          // If profile creation fails after email confirmation, show error
          if (window.location.hash.includes('confirmed=true')) {
            alert('Failed to create user profile. Please try signing in again.');
          }

          // Clear session and show login
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        const { user } = await response.json();
        setUserId(user.id);
        localStorage.setItem('userId', user.id);
      }
    } catch (error) {
      console.error('Error in handleSignedIn:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!userId) {
    return <Authentication setUserId={setUserId} />;
  }

  return <VoiceInterface userId={userId} setUserId={setUserId} />;
}