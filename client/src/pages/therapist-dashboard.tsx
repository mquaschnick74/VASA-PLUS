// Location: client/src/pages/therapist-dashboard.tsx
// DIAGNOSTIC VERSION - Extensive logging and proper error handling

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import SubscriptionStatus from '@/components/SubscriptionStatus';
import VoiceInterface from '@/components/voice-interface';
import { supabase } from '@/lib/supabaseClient';
import { handleLogout } from '@/lib/auth-helpers';
import { useSubscription } from '@/hooks/use-subscription';
import { Users, Clock, TrendingUp, UserPlus } from 'lucide-react';
import { useLocation } from 'wouter';

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
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const loadAttemptRef = useRef(0);
  const [, setLocation] = useLocation();

  const { data: subscription, isLoading } = useSubscription(userId);

  useEffect(() => {
    mountedRef.current = true;
    console.log(`🚀 [THERAPIST-DASH] Component mounted with userId: ${userId}`);

    // NO TIMEOUT - We'll handle errors gracefully instead
    loadDashboardData();

    return () => {
      console.log('🔚 [THERAPIST-DASH] Component unmounting');
      mountedRef.current = false;
    };
  }, [userId]);

  const loadDashboardData = async () => {
    loadAttemptRef.current++;
    const attemptNumber = loadAttemptRef.current;

    console.log(`📊 [THERAPIST-DASH] Load attempt #${attemptNumber} starting...`);
    setLoading(true);
    setError(null);

    try {
      // Step 1: Verify auth session
      console.log(`🔐 [THERAPIST-DASH] Checking auth session...`);
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ [THERAPIST-DASH] Session error:', sessionError);
        setError('Session error. Please refresh the page.');
        setLoading(false);
        return;
      }

      if (!session) {
        console.log('⚠️ [THERAPIST-DASH] No session found - user might need to sign in again');
        setError('Session expired. Please sign in again.');
        setLoading(false);
        return;
      }

      console.log(`✅ [THERAPIST-DASH] Session valid for: ${session.user.email}`);

      // Step 2: Get therapist profile
      console.log(`👤 [THERAPIST-DASH] Loading profile for userId: ${userId}`);
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('❌ [THERAPIST-DASH] Profile error:', profileError);
        setError('Failed to load profile. Please refresh.');
        setLoading(false);
        return;
      }

      if (!profileData) {
        console.error('❌ [THERAPIST-DASH] No profile found for user:', userId);
        setError('Profile not found.');
        setLoading(false);
        return;
      }

      if (!mountedRef.current) {
        console.log('⚠️ [THERAPIST-DASH] Component unmounted, aborting load');
        return;
      }

      setProfile(profileData);
      console.log(`✅ [THERAPIST-DASH] Profile loaded:`, {
        email: profileData.email,
        userType: profileData.user_type,
        id: profileData.id
      });

      // Step 3: Load client relationships - with multiple query attempts
      console.log(`👥 [THERAPIST-DASH] Loading client relationships...`);

      // Try different query formats to handle Supabase foreign key issues
      let relationships = null;
      let relationshipError = null;

      // Attempt 1: Query with user_profiles join
      console.log('🔍 [THERAPIST-DASH] Attempt 1: Query with user_profiles join');
      const attempt1 = await supabase
        .from('therapist_client_relationships')
        .select(`
          *,
          user_profiles!therapist_client_relationships_client_id_fkey(
            id,
            email,
            full_name
          )
        `)
        .eq('therapist_id', userId)
        .eq('status', 'active');

      if (!attempt1.error) {
        console.log('✅ [THERAPIST-DASH] Query 1 successful');
        relationships = attempt1.data;
      } else {
        console.log('⚠️ [THERAPIST-DASH] Query 1 failed:', attempt1.error.message);

        // Attempt 2: Simple query without joins
        console.log('🔍 [THERAPIST-DASH] Attempt 2: Simple query without joins');
        const attempt2 = await supabase
          .from('therapist_client_relationships')
          .select('*')
          .eq('therapist_id', userId)
          .eq('status', 'active');

        if (!attempt2.error) {
          console.log('✅ [THERAPIST-DASH] Query 2 successful, will fetch profiles separately');

          // Fetch client profiles separately
          if (attempt2.data && attempt2.data.length > 0) {
            const clientIds = attempt2.data.map(r => r.client_id);
            const { data: clientProfiles } = await supabase
              .from('user_profiles')
              .select('*')
              .in('id', clientIds);

            // Merge the data
            relationships = attempt2.data.map(rel => {
              const clientProfile = clientProfiles?.find(p => p.id === rel.client_id);
              return {
                ...rel,
                client: clientProfile || { 
                  id: rel.client_id, 
                  email: 'Unknown', 
                  full_name: 'Unknown Client' 
                }
              };
            });
          } else {
            relationships = [];
          }
        } else {
          console.error('❌ [THERAPIST-DASH] Query 2 also failed:', attempt2.error.message);
          relationshipError = attempt2.error;
        }
      }

      if (!mountedRef.current) {
        console.log('⚠️ [THERAPIST-DASH] Component unmounted, aborting load');
        return;
      }

      if (relationshipError) {
        console.log('⚠️ [THERAPIST-DASH] No client relationships loaded, but continuing...');
        setClients([]);
      } else if (relationships && relationships.length > 0) {
        console.log(`✅ [THERAPIST-DASH] Found ${relationships.length} client relationships`);

        // Get usage stats for each client
        const clientsWithStats = await Promise.all(
          relationships.map(async (rel) => {
            const clientData = rel.client || rel.user_profiles || rel;

            if (!clientData) {
              console.log(`⚠️ [THERAPIST-DASH] No client data for relationship ${rel.id}`);
              return null;
            }

            const clientId = rel.client_id || clientData.id;
            console.log(`📈 [THERAPIST-DASH] Loading stats for client: ${clientId}`);

            const { data: sessions, error: sessionsError } = await supabase
              .from('therapeutic_sessions')
              .select('*')
              .eq('user_id', clientId)
              .order('created_at', { ascending: false });

            if (sessionsError) {
              console.log(`⚠️ [THERAPIST-DASH] Sessions query failed for ${clientId}:`, sessionsError.message);
            }

            const totalMinutes = sessions?.reduce((sum, s) => 
              sum + Math.ceil((s.duration_seconds || 0) / 60), 0) || 0;

            return {
              id: clientId,
              email: clientData.email || 'Unknown',
              full_name: clientData.full_name || clientData.email?.split('@')[0] || 'Unknown',
              total_sessions: sessions?.length || 0,
              total_minutes: totalMinutes,
              last_session: sessions?.[0]?.created_at || null,
              relationship_status: rel.status || 'active'
            };
          })
        );

        // Filter out any null results
        const validClients = clientsWithStats.filter(c => c !== null);
        setClients(validClients);
        console.log(`✅ [THERAPIST-DASH] Loaded ${validClients.length} valid clients`);
      } else {
        console.log('✅ [THERAPIST-DASH] No client relationships found (this is OK for new therapists)');
        setClients([]);
      }

    } catch (error) {
      console.error('❌ [THERAPIST-DASH] Unexpected error:', error);
      setError('An unexpected error occurred. Please refresh the page.');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        console.log(`✅ [THERAPIST-DASH] Dashboard load complete (attempt #${attemptNumber})`);
      }
    }
  };

  const inviteClient = async () => {
    if (!inviteEmail) return;

    console.log(`📧 [THERAPIST-DASH] Inviting client: ${inviteEmail}`);
    setInviting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('❌ [THERAPIST-DASH] No session for invite');
        alert('Session expired. Please refresh the page.');
        setInviting(false);
        return;
      }

      const response = await fetch('/api/therapist/invite-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          therapist_id: userId,
          client_email: inviteEmail
        })
      });

      if (response.ok) {
        console.log(`✅ [THERAPIST-DASH] Invitation sent to ${inviteEmail}`);
        setInviteEmail('');
        alert('Invitation sent successfully!');
        loadDashboardData(); // Refresh the client list
      } else {
        const errorText = await response.text();
        console.error('❌ [THERAPIST-DASH] Invite failed:', errorText);
        alert(`Failed to send invitation: ${errorText}`);
      }
    } catch (error) {
      console.error('❌ [THERAPIST-DASH] Invite error:', error);
      alert('Failed to send invitation. Please try again.');
    } finally {
      setInviting(false);
    }
  };

  const totalClientsMinutes = clients.reduce((sum, c) => sum + c.total_minutes, 0);

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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center max-w-md">
          <p className="text-lg mb-4 text-red-500">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  // Calculate subscription values safely
  const minutesRemaining = subscription?.limits?.minutes_remaining || 0;
  const subscriptionTier = subscription?.limits?.subscription_tier || 'trial';
  const clientLimit = subscriptionTier === 'pro' ? 'Unlimited' : 
                      subscriptionTier === 'plus' ? '10' : '3';

  console.log(`🎨 [THERAPIST-DASH] Rendering dashboard with ${clients.length} clients`);

  return (
    <div className="min-h-screen gradient-bg p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Therapist Dashboard</h1>
            {profile && (
              <p className="text-sm text-muted-foreground mt-1">
                {profile.email} • {profile.user_type}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => window.location.href = '/pricing'}
            >
              View Pricing
            </Button>
            {/* TEMPORARY: API Token Copy Button for Testing */}
            <Button 
              variant="outline"
              onClick={async () => {
                const { data } = await supabase.auth.getSession();
                console.log('TOKEN:', data.session?.access_token);
                navigator.clipboard.writeText(data.session?.access_token || '');
                alert('Token copied to clipboard!');
              }}
            >
              Copy API Token
            </Button>
            <Button onClick={() => handleLogout(setUserId)} data-testid="button-signout">
              Sign Out
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Subscription Status Card - Full Width on Mobile */}
          <div className="md:col-span-2 lg:col-span-4">
            <SubscriptionStatus userId={userId} />
          </div>

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
                  <div 
                    key={client.id} 
                    className="p-4 rounded-lg glass-subtle cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setLocation(`/therapist/client/${client.id}/sessions`)}
                    data-testid={`card-client-${client.id}`}
                  >
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

        {/* Voice Interface Section */}
        <div className="mt-8">
          <VoiceInterface 
            userId={userId} 
            setUserId={setUserId}
            hideLogoutButton={true}
          />
        </div>
      </div>
    </div>
  );
}