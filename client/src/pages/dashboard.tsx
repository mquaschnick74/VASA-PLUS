// Location: client/src/pages/dashboard.tsx

import { useState, useEffect } from 'react';
import Authentication from '@/components/authentication';
import VoiceInterface from '@/components/voice-interface';
import TherapistDashboard from './therapist-dashboard'; // ADD THIS IMPORT
import { supabase } from '@/lib/supabaseClient';
import { useSubscription } from '@/hooks/use-subscription'; // ADD THIS IMPORT

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userType, setUserType] = useState<string | null>(null); // ADD THIS STATE

  // ADD: Get subscription data to check user type
  const { data: subscription } = useSubscription(userId || '');

  useEffect(() => {
    checkAuthStatus();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUserId(null);
        setUserType(null);
        localStorage.clear();
      } else if (event === 'SIGNED_IN' && session) {
        await handleSignedIn(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ADD: Effect to update userType when subscription data changes
  useEffect(() => {
    if (subscription?.limits?.user_type) {
      setUserType(subscription.limits.user_type);
    }
  }, [subscription]);

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
        const userData = await verifyResponse.json();
        setUserId(storedUserId);

        // Check if user is a therapist from the response
        if (userData?.userProfile?.user_type === 'therapist') {
          setUserType('therapist');
        }
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
          authUserId: session.user.id,
          userType: 'individual' // Default to individual for new users
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

  // CRITICAL CHANGE: Route based on user type
  if (userType === 'therapist') {
    return (
      <>
        <div className="fixed top-0 left-0 bg-purple-600 text-white px-3 py-1 text-xs rounded-br-lg z-50">
          THERAPIST MODE
        </div>
        <TherapistDashboard userId={userId} setUserId={setUserId} />
      </>
    );
  }

  // Default to regular voice interface for clients/individuals
  return <VoiceInterface userId={userId} setUserId={setUserId} />;
}