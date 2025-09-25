// client/src/pages/therapist-dashboard.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabaseClient } from '@/lib/supabaseClient';
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

  const { data: subscription } = useSubscription(userId);

  useEffect(() => {
    loadClients();
  }, [userId]);

  const loadClients = async () => {
    setLoading(true);
    try {
      // Get therapist's clients
      const { data: relationships } = await supabaseClient
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

      if (relationships) {
        // Get usage stats for each client
        const clientsWithStats = await Promise.all(
          relationships.map(async (rel) => {
            const { data: sessions } = await supabaseClient
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

        setClients(clientsWithStats);
      }
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const inviteClient = async () => {
    if (!inviteEmail) return;

    setInviting(true);
    try {
      const token = (await supabaseClient.auth.getSession()).data.session?.access_token;

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
        // Show success message
        alert('Invitation sent successfully!');
      }
    } catch (error) {
      console.error('Error inviting client:', error);
      alert('Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const totalClientsMinutes = clients.reduce((sum, c) => sum + c.total_minutes, 0);

  return (
    <div className="min-h-screen gradient-bg p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Therapist Dashboard</h1>
          <Button onClick={() => {
            supabaseClient.auth.signOut();
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
                  <p className="text-2xl font-bold">
                    {subscription?.minutesRemaining || 0}
                  </p>
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
                  <p className="text-2xl font-bold">
                    {subscription?.tier === 'pro' ? '10' : '∞'}
                  </p>
                  <p className="text-sm text-muted-foreground">Client Limit</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invite Client */}
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
              />
              <Button 
                onClick={inviteClient} 
                disabled={inviting || !inviteEmail}
              >
                {inviting ? 'Sending...' : 'Send Invitation'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Clients List */}
        <Card className="glass">
          <CardHeader>
            <CardTitle>Your Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Loading clients...</p>
            ) : clients.length === 0 ? (
              <p className="text-muted-foreground">No clients yet. Send invitations to get started.</p>
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