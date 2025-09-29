// Location: client/src/pages/therapist-dashboard.tsx
// FIXED: Removed aggressive timeout and better error handling

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
  const [error, setError] = useState<string | null>(null);

  const { data: subscription } = useSubscription(userId);

  useEffect(() => {
    // REMOVED THE TIMEOUT - No more auto-signout!
    console.log('Loading therapist dashboard for:', userId);
    loadClients();
  }, [userId]);

  const loadClients = async () => {
    setLoading(true);
    setError(null);

    try {
      // First verify the therapist profile exists
      console.log('Checking therapist profile...');
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
        setError('Unable to load therapist profile. Please try refreshing.');
        setLoading(false);
        return;
      }

      if (!profile || profile.user_type !== 'therapist') {
        console.error('Not a therapist profile:', profile);
        setError('This account is not registered as a therapist.');
        setLoading(false);
        return;
      }

      console.log('Therapist profile found:', profile.email);

      // Get therapist's clients (may be empty, that's OK!)
      console.log('Loading client relationships...');
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
        console.warn('Relationships query error (non-fatal):', relError);
        // Don't fail - just show no clients
        setClients([]);
      } else if (relationships && relationships.length > 0) {
        console.log(`Found ${relationships.length} client relationships`);

        // Get usage stats for each client
        const clientsWithStats = await Promise.all(
          relationships.map(async (rel) => {
            if (!rel.client) return null;

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

        setClients(clientsWithStats.filter(c => c !== null) as ClientData[]);
      } else {
        console.log('No client relationships found (this is normal for new therapists)');
        setClients([]);
      }
    } catch (error) {
      console.error('Error loading clients:', error);
      setError('Unable to load clients. Please try refreshing the page.');
    } finally {
      setLoading(false);
    }
  };

  const inviteClient = async () => {
    if (!inviteEmail) return;

    setInviting(true);
    setError(null);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      if (!token) {
        setError('Session expired. Please sign in again.');
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
        alert(`✅ Invitation sent!\nMagic Code: ${result.invitation?.magic_token || 'Check email'}`);
        loadClients();
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to send invitation');
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
          <Button 
            onClick={async () => {
              await supabase.auth.signOut();
              localStorage.clear();
              sessionStorage.clear();
              setUserId(null);
            }}
            variant="outline"
          >
            Sign Out
          </Button>
        </div>
      </div>

      {/* Error Display */}
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
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Subscription</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {subscription?.subscription_tier || 'Free'}
            </div>
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
                        <h3 className="font-semibold">{client.full_name}</h3>
                        <p className="text-sm text-muted-foreground">{client.email}</p>
                        <div className="flex space-x-4 mt-2 text-sm">
                          <span>{client.total_sessions} sessions</span>
                          <span>{client.total_minutes} minutes</span>
                          {client.last_session && (
                            <span>Last: {new Date(client.last_session).toLocaleDateString()}</span>
                          )}
                        </div>
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