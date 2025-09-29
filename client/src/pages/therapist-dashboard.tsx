// Location: client/src/pages/therapist-dashboard-diagnostic.tsx
// DIAGNOSTIC VERSION - Logs everything to find the logout trigger

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { Users, Clock, TrendingUp, UserPlus } from 'lucide-react';

interface TherapistDashboardProps {
  userId: string;
  setUserId: (id: string | null) => void;
}

export default function TherapistDashboard({ userId, setUserId }: TherapistDashboardProps) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  // DIAGNOSTIC: Track what's happening
  console.log('🔍 THERAPIST DASHBOARD MOUNTED');
  console.log('UserId:', userId);
  console.log('Current time:', new Date().toISOString());

  useEffect(() => {
    console.log('🔍 useEffect triggered');

    // IMPORTANT: Override any global logout attempts
    const originalSetUserId = setUserId;
    const protectedSetUserId = (id: string | null) => {
      console.log('⚠️ ATTEMPT TO SET USER ID TO:', id);
      console.trace('Stack trace for setUserId call');
      if (id === null && mounted.current) {
        console.error('🚫 BLOCKED LOGOUT ATTEMPT!');
        // Don't actually log out
        return;
      }
      originalSetUserId(id);
    };

    // Replace setUserId temporarily
    setUserId = protectedSetUserId as any;

    loadData();

    return () => {
      console.log('🔍 Component unmounting');
      mounted.current = false;
      setUserId = originalSetUserId; // Restore original
    };
  }, [userId]);

  const loadData = async () => {
    console.log('🔍 LoadData started');
    setLoading(true);

    try {
      // Step 1: Check session
      console.log('📍 Step 1: Checking session...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ Session error:', sessionError);
        setError('Session error: ' + sessionError.message);
        setLoading(false);
        return;
      }

      if (!session) {
        console.error('❌ No session found');
        setError('No active session');
        setLoading(false);
        return;
      }

      console.log('✅ Session valid:', session.user.email);

      // Step 2: Check profile WITHOUT signing out on failure
      console.log('📍 Step 2: Checking profile...');
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('⚠️ Profile error (non-fatal):', profileError);
        setError('Profile check failed: ' + profileError.message);
        // DON'T SIGN OUT - Just show error
      } else {
        console.log('✅ Profile found:', profile);
      }

      // Step 3: Try to get relationships (optional)
      console.log('📍 Step 3: Checking relationships...');
      try {
        const { data: relationships, error: relError } = await supabase
          .from('therapist_client_relationships')
          .select('*')
          .eq('therapist_id', userId);

        if (relError) {
          console.warn('⚠️ Relationships error (non-fatal):', relError);
          // This is OK - table might not exist
        } else {
          console.log('✅ Relationships:', relationships?.length || 0);
          setClients(relationships || []);
        }
      } catch (e) {
        console.warn('⚠️ Relationships query failed (non-fatal):', e);
      }

      // Step 4: Check subscription (optional)
      console.log('📍 Step 4: Checking subscription...');
      try {
        const response = await fetch(`/api/subscription/limits?userId=${userId}`);
        if (!response.ok) {
          console.warn('⚠️ Subscription API returned:', response.status);
        } else {
          const data = await response.json();
          console.log('✅ Subscription data:', data);
        }
      } catch (e) {
        console.warn('⚠️ Subscription fetch failed (non-fatal):', e);
      }

    } catch (error) {
      console.error('❌ Unexpected error:', error);
      setError('Unexpected error: ' + error);
    } finally {
      console.log('🔍 LoadData complete');
      setLoading(false);
    }
  };

  // DIAGNOSTIC: Monitor auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔔 AUTH STATE CHANGED:', event);
      console.log('Session:', session?.user?.email);

      if (event === 'SIGNED_OUT') {
        console.error('🚨 SIGNED OUT EVENT DETECTED!');
        console.trace('Sign out stack trace');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading therapist dashboard...</p>
          <p className="text-xs text-muted-foreground mt-2">Check console for diagnostic info</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg p-4">
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Therapist Dashboard</h1>
            <p className="text-muted-foreground">Diagnostic Mode - Check Console</p>
            <p className="text-xs text-red-500 mt-2">User ID: {userId}</p>
          </div>
          <Button 
            onClick={() => {
              console.log('🔍 Manual sign out clicked');
              supabase.auth.signOut();
              localStorage.clear();
              setUserId(null);
            }}
            variant="outline"
          >
            Sign Out
          </Button>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto mb-4">
          <Card className="border-red-500">
            <CardContent className="pt-6">
              <p className="text-red-500">Error: {error}</p>
              <Button 
                onClick={loadData}
                className="mt-4"
                variant="outline"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Dashboard Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p>✅ Dashboard Loaded Successfully</p>
              <p>User ID: {userId}</p>
              <p>Clients: {clients.length}</p>
              <p>Time: {new Date().toLocaleTimeString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}