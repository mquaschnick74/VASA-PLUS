// Location: client/src/pages/therapist-dashboard.tsx
// FIXED VERSION - No timeout, no auth listeners

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { useSubscription } from '@/hooks/use-subscription';
import { Users, Clock, TrendingUp, UserPlus } from 'lucide-react';

interface TherapistDashboardProps {
  userId: string;
  setUserId: (id: string | null) => void;
}

interface ClientData {
  id: string;
  email: string;
  full_name: string;
  total_sessions: number;
  total_minutes: number;
  last_session: string | null;
  relationship_status: string;
}

export default function TherapistDashboard({ userId, setUserId }: TherapistDashboardProps) {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  const { data: subscription, isLoading } = useSubscription(userId);

  useEffect(() => {
    console.log(`✅ Therapist Dashboard Rendered - User: ${userId}`);
    loadClients();
  }, [userId]);

  const loadClients = async () => {
    console.log('📍 Loading therapist dashboard data...');
    setLoading(true);

    try {
      // Get therapist profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profileData) {
        console.error('Failed to load therapist profile:', profileError);
        setLoading(false);
        return;
      }

      setProfile(profileData);
      console.log(`✅ Profile loaded: ${profileData.email}`);

      // Get therapist's clients
      const { data: relationships, error: relError } = await supabase
        .from('therapist_client_relationships')
        .select(`
          *,
          client:client_id(
            id,
            email,
            full_name
          )
        `)
        .eq('therapist_id', userId)
        .eq('status', 'active');

      if (relError) {
        console.error('Failed to load client relationships:', relError);
        setClients([]);
      } else if (relationships && relationships.length > 0) {
        console.log(`✅ Found ${relationships.length} client relationships`);

        // Get usage stats for each client
        const clientsWithStats = await Promise.all(
          relationships.map(async (rel) => {
            // Skip if client data is missing
            if (!rel.client) {
              return null;
            }

            const { data: sessions } = await supabase
              .from('therapeutic_sessions')
              .select('*')
              .eq('user_id', rel.client_id)
              .order('created_at', { ascending: false });

            const totalMinutes = sessions?.reduce((sum, s) => 
              sum + Math.ceil((s.duration_seconds || 0) / 60), 0) || 0;

            return {
              id: rel.client_id,
              email: rel.client.email,
              full_name: rel.client.full_name || rel.client.email.split('@')[0],
              total_sessions: sessions?.length || 0,
              total_minutes: totalMinutes,
              last_session: sessions?.[0]?.created_at || null,
              relationship_status: rel.status
            };
          })
        );

        // Filter out any null results
        const validClients = clientsWithStats.filter(c => c !== null);
        setClients(validClients);
      } else {
        console.log('✅ Found 0 client relationships');
        setClients([]);
      }

    } catch (error) {
      console.error('Error loading therapist dashboard:', error);
      setClients([]);
    } finally {
      setLoading(false);
      console.log('✅ Therapist Dashboard Rendered - User:', userId);
    }
  };

  const inviteClient = async () => {
    if (!inviteEmail) return;

    setInviting(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      if (!token) {
        console.error('No auth token available');
        alert('Session expired. Please refresh the page and try again.');
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
        setInviteEmail('');
        alert('Invitation sent successfully!');
        loadClients(); // Refresh the client list
      } else {
        const error = await response.text();
        alert(`Failed to send invitation: ${error}`);
      }
    } catch (error) {
      console.error('Error inviting client:', error);
      alert('Failed to send invitation. Please try again.');
    } finally {
      setInviting(false);
    }
  };

  const totalClientsMinutes = clients.reduce((sum, c) => sum + c.total_minutes, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Calculate subscription values safely
  const minutesRemaining = subscription?.limits?.minutes_remaining || 0;
  const subscriptionTier = subscription?.limits?.subscription_tier || 'trial';
  const clientLimit = subscriptionTier === 'pro' ? 'Unlimited' : 
                      subscriptionTier === 'plus' ? '10' : '3';

  return (
    <div className="min-h-screen gradient-bg p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Therapist Dashboard</h1>
            {profile && (
              <p className="text-sm text-muted-foreground mt-1">{profile.email}</p>
            )}
          </div>
          <Button onClick={async () => {
            await supabase.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            setUserId(null);
          }}>
            Sign Out
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <Users className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{clients.length}</p>
                  <p className="text-sm text-muted-foreground">Active Clients</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <Clock className="w-8 h-8 text-accent" />
                <div>
                  <p className="text-2xl font-bold">{totalClientsMinutes}</p>
                  <p className="text-sm text-muted-foreground">Minutes Used</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <TrendingUp className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{minutesRemaining}</p>
                  <p className="text-sm text-muted-foreground">Minutes Left</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <UserPlus className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{clientLimit}</p>
                  <p className="text-sm text-muted-foreground">Client Limit</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Clients Section */}
        <Card className="glass">
          <CardHeader>
            <CardTitle>Your Clients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Invite Form */}
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Client email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg glass border border-white/10"
                disabled={inviting}
              />
              <Button 
                onClick={inviteClient}
                disabled={inviting || !inviteEmail}
                className="px-6"
              >
                {inviting ? 'Sending...' : 'Invite Client'}
              </Button>
            </div>

            {/* Clients List */}
            {clients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No clients yet. Invite your first client above.
              </div>
            ) : (
              <div className="space-y-3">
                {clients.map(client => (
                  <div key={client.id} className="p-4 rounded-lg glass-subtle">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{client.full_name}</p>
                        <p className="text-sm text-muted-foreground">{client.email}</p>
                        {client.last_session && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last session: {new Date(client.last_session).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm">{client.total_sessions} sessions</p>
                        <p className="text-xs text-muted-foreground">{client.total_minutes} minutes</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Info */}
        {!isLoading && subscription && (
          <Card className="glass">
            <CardHeader>
              <CardTitle>Subscription Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Plan</p>
                  <p className="font-medium capitalize">{subscriptionTier}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{subscription.limits?.subscription_status || 'Active'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}