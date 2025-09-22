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
      if (event === 'SIGNED_OUT') {
        setUserId(null);
        localStorage.clear();
      } else if (event === 'SIGNED_IN' && session) {
        await handleSignedIn(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        await handleSignedIn(session);
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignedIn = async (session: any) => {
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
          authUserId: session.user.id
        })
      });

      if (response.ok) {
        const { user } = await response.json();
        setUserId(user.id);
        localStorage.setItem('userId', user.id);
      }
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