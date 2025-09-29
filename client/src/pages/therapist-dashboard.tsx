// client/src/pages/therapist-dashboard.tsx
// FIXED VERSION - No auth listeners, prevents conflicts

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { Users, Clock, TrendingUp, UserPlus } from 'lucide-react';

interface TherapistDashboardProps {
  userId: string;
  setUserId: (id: string | null) => void;
}

interface ClientData {
  id: string;
  client_id: string;
  status: string;
}

export default function TherapistDashboard({ userId, setUserId }: TherapistDashboardProps) {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<any>(null);

  console.log('✅ Therapist Dashboard Rendered - User:', userId);

  // NO AUTH LISTENERS HERE - Dashboard.tsx handles all auth
  useEffect(() => {
    let mounted = true;

    const loadDashboardData = async () => {
      console.log('📍 Loading therapist dashboard data...');
      setLoading(true);
      setError(null);

      try {
        // Load profile
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (profileError) {
          console.error('Profile load error:', profileError);
          if (mounted) {
            setError('Unable to load profile');
            setLoading(false);
          }
          return;
        }

        console.log('✅ Profile loaded:', profile.email);

        // Load relationships (may be empty for new therapists)
        const { data: relationships, error: relError } = await supabase
          .from('therapist_client_relationships')
          .select('*')
          .eq('therapist_id', userId);

        if (!relError && mounted) {
          console.log(`✅ Found ${relationships?.length || 0} client relationships`);
          setClients(relationships || []);
        } else if (relError) {
          console.warn('Relationships query failed (non-fatal):', relError);
          setClients([]);
        }

        // Load subscription
        try {
          const response = await fetch(`/api/subscription/limits?userId=${userId}`);
          if (response.ok) {
            const subData = await response.json();
            if (mounted) {
              console.log('✅ Subscription loaded');
              setSubscription(subData);
            }
          }
        } catch (e) {
          console.warn('Subscription load failed (non-fatal)');
        }

      } catch (error) {
        console.error('Dashboard load error:', error);
        if (mounted) {
          setError('Failed to load dashboard data');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadDashboardData();

    return () => {
      mounted = false;
    };
  }, [userId]);

  const handleSignOut = async () => {
    console.log('Manual sign out requested');
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    setUserId(null);
  };

  const inviteClient = async () => {
    if (!inviteEmail) return;

    setInviting(true);
    setError(null);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      if (!token) {
        setError('Session expired. Please sign in again.');
        setInviting(false);
        return;
      }

      const response = await fetch('/api/therapist/invite-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          therapist_id: userId,
          client_email: inviteEmail
        })
      });

      if (response.ok) {
        const result = await response.json();
        setInviteEmail('');
        alert(`✅ Invitation sent!\n\nMagic Code: ${result.invitation?.magic_token || 'Sent via email'}\n\nShare this code with ${inviteEmail}`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Error inviting client:', error);
      setError('Failed to send invitation. Please try again.');
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading therapist dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg p-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Therapist Dashboard</h1>
            <p className="text-muted-foreground">Manage your clients and sessions</p>
          </div>
          <Button onClick={handleSignOut} variant="outline">
            Sign Out
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto mb-4">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-500">
            {error}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients.length}</div>
            <p className="text-xs text-muted-foreground">Active relationships</p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Minutes Used</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {subscription?.minutes_used || 0} / {subscription?.minutes_limit || 45}
            </div>
            <p className="text-xs text-muted-foreground">
              {subscription?.minutes_remaining || 45} remaining
            </p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Subscription</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {subscription?.subscription_tier || 'Trial'}
            </div>
            <p className="text-xs text-muted-foreground">
              {subscription?.is_trial ? `${subscription?.trial_days_left || 30} days left` : 'Active'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invite Client */}
      <div className="max-w-7xl mx-auto mb-8">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Invite New Client</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex space-x-4">
              <input
                type="email"
                placeholder="client@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-4 py-2 rounded-lg bg-secondary"
                disabled={inviting}
              />
              <Button 
                onClick={inviteClient} 
                disabled={inviting || !inviteEmail}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                {inviting ? 'Sending...' : 'Send Invitation'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clients List */}
      <div className="max-w-7xl mx-auto">
        <Card className="glass">
          <CardHeader>
            <CardTitle>Your Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {clients.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No clients yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Send invitations to get started
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {clients.map((client) => (
                  <div key={client.id} className="p-4 rounded-lg bg-secondary/50">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">Client ID: {client.client_id}</p>
                        <p className="text-sm text-muted-foreground">Status: {client.status}</p>
                      </div>
                      <Button size="sm" variant="outline">
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}