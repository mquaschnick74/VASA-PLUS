import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import VoiceInterface from '@/components/voice-interface';
import { supabase } from '@/lib/supabaseClient';

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
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*, therapist:invited_by(*)')
        .eq('id', userId)
        .single();

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
      const response = await fetch(`/api/auth/user-context/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setUserContext(data);
      }
    } catch (error) {
      console.error('Error loading client data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      {/* Header */}
      <nav className="sticky top-0 z-50 glass-strong">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold">Client Dashboard</h1>
            <Button onClick={() => {
              supabase.auth.signOut();
              setUserId(null);
            }}>
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* Main Voice Interface */}
          <div className="lg:col-span-2">
            {userContext && (
              <VoiceInterface 
                userId={userId} 
                setUserId={setUserId}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
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
                <p className="text-sm text-muted-foreground">
                  Your voice sessions are managed through your therapist's account. 
                  Contact them if you have questions about session limits.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}