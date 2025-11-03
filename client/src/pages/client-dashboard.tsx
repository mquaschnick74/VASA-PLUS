// Location: client/src/pages/client-dashboard.tsx

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import VoiceInterface from '@/components/voice-interface';
import PCAMasterAnalyst from '@/components/PCAMasterAnalyst';
import { supabase } from '@/lib/supabaseClient';
import { handleLogout } from '@/lib/auth-helpers';
import { Link } from 'wouter';
import { HelpCircle } from 'lucide-react';
import Header from '@/components/shared/Header';

interface ClientDashboardProps {
  userId: string;
  setUserId: (id: string | null) => void;
}

interface TherapistInfo {
  id: string;
  email: string;
  full_name: string;
}

export default function ClientDashboard({ userId, setUserId }: ClientDashboardProps) {
  const [therapist, setTherapist] = useState<TherapistInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [userContext, setUserContext] = useState<any>(null);

  useEffect(() => {
    loadClientData();
  }, [userId]);

  const loadClientData = async () => {
    try {
      // Get user profile with therapist info
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*, therapist:invited_by(*)')
        .eq('id', userId)
        .single();

      if (profileError || !profile) {
        console.error('Profile not found, signing out');
        handleLogout(setUserId);
        return;
      }

      if (profile?.invited_by) {
        // Get therapist details
        const { data: therapistProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', profile.invited_by)
          .single();

        if (therapistProfile) {
          setTherapist(therapistProfile);
        }
      }

      // Get user context for voice interface
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        console.error('No auth token, signing out');
        handleLogout(setUserId);
        return;
      }

      const response = await fetch(`/api/auth/user-context/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setUserContext(data);
      } else if (response.status === 401 || response.status === 404) {
        console.error('User context not found, signing out');
        handleLogout(setUserId);
        return;
      }
    } catch (error) {
      console.error('Error loading client data:', error);
      handleLogout(setUserId);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!userContext) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <p className="text-lg mb-4">Unable to load dashboard</p>
          <Button onClick={() => handleLogout(setUserId)} data-testid="button-signout">
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Header userId={userId} setUserId={setUserId} userType="client" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Dashboard Title */}
        <h1 className="text-2xl sm:text-3xl font-bold mb-6">Client Dashboard</h1>
        {/* Top Row - Therapist and Session Info Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Therapist Info Card */}
          {therapist && (
            <Card className="glass">
              <CardHeader>
                <CardTitle>Your Therapist</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="font-medium">{therapist.full_name}</p>
                  <p className="text-sm text-muted-foreground">{therapist.email}</p>
                  <div className="pt-4">
                    <Alert>
                      <AlertDescription>
                        You're using your therapist's subscription for voice sessions.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Session Info */}
          <Card className="glass">
            <CardHeader>
              <CardTitle>Session Information</CardTitle>
            </CardHeader>
            <CardContent>
              {therapist ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Your voice sessions are managed through your therapist's account.
                  </p>
                  {userContext?.sessionDurationLimit && (
                    <Alert>
                      <AlertDescription>
                        <strong>Session Limit:</strong> Your therapist has set a {Math.floor(userContext.sessionDurationLimit / 60)}-minute limit for sessions.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You're using your own subscription for voice sessions.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* PCA Master Analyst */}
        <div className="mb-8">
          <PCAMasterAnalyst userId={userId} />
        </div>

        {/* Main Voice Interface */}
        <VoiceInterface
          userId={userId}
          setUserId={setUserId}
          hideLogoutButton={true}
        />
      </div>
    </div>
  );
}