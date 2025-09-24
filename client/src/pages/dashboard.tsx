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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      if (event === 'SIGNED_OUT') {
        setUserId(null);
        localStorage.clear();
      } else if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        await handleSignedIn(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('confirmed=true')) {
      window.history.replaceState(null, '', window.location.pathname);
      checkAuthStatus();
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        await handleSignedIn(session);
      } else {
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
        const authToken = session.access_token;
        const verifyResponse = await fetch(`/api/auth/user-context/${storedUserId}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (verifyResponse.status === 404 || verifyResponse.status === 401) {
          console.log('User not found, clearing and showing login');
          localStorage.removeItem('userId');
          storedUserId = null;
          // Sign out to clear auth state
          await supabase.auth.signOut();
          setUserId(null);
          return;
        } else if (verifyResponse.ok) {
          setUserId(storedUserId);
          return;
        }
      }

      if (!storedUserId) {
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

          // If profile creation fails, sign out and show login
          await supabase.auth.signOut();
          setUserId(null);
          setLoading(false);
          return;
        }

        const { user } = await response.json();
        setUserId(user.id);
        localStorage.setItem('userId', user.id);
      }
    } catch (error) {
      console.error('Error in handleSignedIn:', error);
      // On any error, show login
      await supabase.auth.signOut();
      setUserId(null);
    } finally {
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