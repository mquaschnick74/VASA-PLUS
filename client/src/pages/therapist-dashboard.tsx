// Location: client/src/pages/therapist-dashboard.tsx
// DIAGNOSTIC VERSION - Extensive logging and proper error handling

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SubscriptionStatus from "@/components/SubscriptionStatus";
import VoiceInterface from "@/components/voice-interface";
import { supabase } from "@/lib/supabaseClient";
import { handleLogout } from "@/lib/auth-helpers";
import { useSubscription } from "@/hooks/use-subscription";
import { Users, Clock, TrendingUp, UserPlus } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

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
  session_duration_limit: number;
}

interface PendingInvitation {
  id: string;
  client_email: string;
  sent_at: string;
  expires_at: string;
}

export default function TherapistDashboard({
  userId,
  setUserId,
}: TherapistDashboardProps) {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const loadAttemptRef = useRef(0);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: subscription } = useSubscription(userId);

  useEffect(() => {
    mountedRef.current = true;
    console.log(`🚀 [THERAPIST-DASH] Component mounted with userId: ${userId}`);

    // NO TIMEOUT - We'll handle errors gracefully instead
    loadDashboardData();

    return () => {
      console.log("🔚 [THERAPIST-DASH] Component unmounting");
      mountedRef.current = false;
    };
  }, [userId]);

  const loadDashboardData = async () => {
    loadAttemptRef.current++;
    const attemptNumber = loadAttemptRef.current;

    console.log(
      `📊 [THERAPIST-DASH] Load attempt #${attemptNumber} starting...`,
    );
    setLoading(true);
    setError(null);

    try {
      // Step 1: Verify auth session
      console.log(`🔐 [THERAPIST-DASH] Checking auth session...`);
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error("❌ [THERAPIST-DASH] Session error:", sessionError);
        setError("Session error. Please refresh the page.");
        setLoading(false);
        return;
      }

      if (!session) {
        console.log(
          "⚠️ [THERAPIST-DASH] No session found - user might need to sign in again",
        );
        setError("Session expired. Please sign in again.");
        setLoading(false);
        return;
      }

      console.log(
        `✅ [THERAPIST-DASH] Session valid for: ${session.user.email}`,
      );

      // Step 2: Get therapist profile
      console.log(`👤 [THERAPIST-DASH] Loading profile for userId: ${userId}`);
      const { data: profileData, error: profileError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileError) {
        console.error("❌ [THERAPIST-DASH] Profile error:", profileError);
        setError("Failed to load profile. Please refresh.");
        setLoading(false);
        return;
      }

      if (!profileData) {
        console.error("❌ [THERAPIST-DASH] No profile found for user:", userId);
        setError("Profile not found.");
        setLoading(false);
        return;
      }

      if (!mountedRef.current) {
        console.log("⚠️ [THERAPIST-DASH] Component unmounted, aborting load");
        return;
      }

      setProfile(profileData);
      console.log(`✅ [THERAPIST-DASH] Profile loaded:`, {
        email: profileData.email,
        userType: profileData.user_type,
        id: profileData.id,
      });

      // Step 3: Load client relationships - with multiple query attempts
      console.log(`👥 [THERAPIST-DASH] Loading client relationships...`);

      // Try different query formats to handle Supabase foreign key issues
      let relationships = null;
      let relationshipError = null;

      // Attempt 1: Query with user_profiles join
      console.log(
        "🔍 [THERAPIST-DASH] Attempt 1: Query with user_profiles join",
      );
      const attempt1 = await supabase
      .from("therapist_client_relationships")
      .select(
        `
        *,
        session_duration_limit,
        user_profiles!therapist_client_relationships_client_id_fkey(
          id,
          email,
          full_name
        )
      `,
      )
      .eq("therapist_id", userId)
      .eq("status", "active");

      if (!attempt1.error) {
        console.log("✅ [THERAPIST-DASH] Query 1 successful");
        relationships = attempt1.data;
      } else {
        console.log(
          "⚠️ [THERAPIST-DASH] Query 1 failed:",
          attempt1.error.message,
        );

        // Attempt 2: Simple query without joins
        console.log(
          "🔍 [THERAPIST-DASH] Attempt 2: Simple query without joins",
        );
        const attempt2 = await supabase
          .from("therapist_client_relationships")
          .select("*")
          .eq("therapist_id", userId)
          .eq("status", "active");

        if (!attempt2.error) {
          console.log(
            "✅ [THERAPIST-DASH] Query 2 successful, will fetch profiles separately",
          );

          // Fetch client profiles separately
          if (attempt2.data && attempt2.data.length > 0) {
            const clientIds = attempt2.data.map((r) => r.client_id);
            const { data: clientProfiles } = await supabase
              .from("user_profiles")
              .select("*")
              .in("id", clientIds);

            // Merge the data
            relationships = attempt2.data.map((rel) => {
              const clientProfile = clientProfiles?.find(
                (p) => p.id === rel.client_id,
              );
              return {
                ...rel,
                client: clientProfile || {
                  id: rel.client_id,
                  email: "Unknown",
                  full_name: "Unknown Client",
                },
              };
            });
          } else {
            relationships = [];
          }
        } else {
          console.error(
            "❌ [THERAPIST-DASH] Query 2 also failed:",
            attempt2.error.message,
          );
          relationshipError = attempt2.error;
        }
      }

      if (!mountedRef.current) {
        console.log("⚠️ [THERAPIST-DASH] Component unmounted, aborting load");
        return;
      }

      if (relationshipError) {
        console.log(
          "⚠️ [THERAPIST-DASH] No client relationships loaded, but continuing...",
        );
        setClients([]);
      } else if (relationships && relationships.length > 0) {
        console.log(
          `✅ [THERAPIST-DASH] Found ${relationships.length} client relationships`,
        );

        // Get usage stats for each client
        const clientsWithStats = await Promise.all(
          relationships.map(async (rel) => {
            const clientData = rel.client || rel.user_profiles || rel;

            if (!clientData) {
              console.log(
                `⚠️ [THERAPIST-DASH] No client data for relationship ${rel.id}`,
              );
              return null;
            }

            const clientId = rel.client_id || clientData.id;
            console.log(
              `📈 [THERAPIST-DASH] Loading stats for client: ${clientId}`,
            );

            const { data: sessions, error: sessionsError } = await supabase
              .from("therapeutic_sessions")
              .select("*")
              .eq("user_id", clientId)
              .order("created_at", { ascending: false });

            if (sessionsError) {
              console.log(
                `⚠️ [THERAPIST-DASH] Sessions query failed for ${clientId}:`,
                sessionsError.message,
              );
            }

            const totalMinutes =
              sessions?.reduce(
                (sum, s) => sum + Math.ceil((s.duration_seconds || 0) / 60),
                0,
              ) || 0;

            return {
              id: clientId,
              email: clientData.email || "Unknown",
              full_name:
                clientData.full_name ||
                clientData.email?.split("@")[0] ||
                "Unknown",
              total_sessions: sessions?.length || 0,
              total_minutes: totalMinutes,
              last_session: sessions?.[0]?.created_at || null,
              relationship_status: rel.status || "active",
              session_duration_limit: rel.session_duration_limit || 900,
            };
          }),
        );

        // Filter out any null results
        const validClients = clientsWithStats.filter((c) => c !== null);
        setClients(validClients);
        console.log(
          `✅ [THERAPIST-DASH] Loaded ${validClients.length} valid clients`,
        );
      } else {
        console.log(
          "✅ [THERAPIST-DASH] No client relationships found (this is OK for new therapists)",
        );
        setClients([]);
      }

      // Load pending invitations
      console.log("📨 [THERAPIST-DASH] Loading pending invitations...");
      setInvitationsLoading(true);
      try {
        const inviteResponse = await fetch("/api/therapist/invitations", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (inviteResponse.ok) {
          const { invitations } = await inviteResponse.json();
          setPendingInvitations(invitations || []);
          console.log(`✅ [THERAPIST-DASH] Loaded ${invitations?.length || 0} pending invitations`);
        } else if (inviteResponse.status === 401) {
          console.error("❌ [THERAPIST-DASH] Unauthorized - logging out");
          setPendingInvitations([]); // Clear stale data
          handleLogout(setUserId);
          return;
        } else {
          console.error("❌ [THERAPIST-DASH] Failed to load invitations:", inviteResponse.status);
          setPendingInvitations([]); // Clear stale data
          toast({
            title: "Warning",
            description: "Could not load pending invitations",
            variant: "destructive",
          });
        }
      } finally {
        if (mountedRef.current) {
          setInvitationsLoading(false);
        }
      }
    } catch (error) {
      console.error("❌ [THERAPIST-DASH] Unexpected error:", error);
      setError("An unexpected error occurred. Please refresh the page.");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        console.log(
          `✅ [THERAPIST-DASH] Dashboard load complete (attempt #${attemptNumber})`,
        );
      }
    }
  };

  const inviteClient = async () => {
    if (!inviteEmail) return;

    console.log(`📧 [THERAPIST-DASH] Inviting client: ${inviteEmail}`);
    setInviting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        console.error("❌ [THERAPIST-DASH] No session for invite");
        toast({
          title: "Session Expired",
          description: "Please refresh the page and try again.",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch("/api/therapist/invite-client", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          therapist_id: userId,
          client_email: inviteEmail,
        }),
      });

      if (response.ok) {
        console.log(`✅ [THERAPIST-DASH] Invitation sent to ${inviteEmail}`);
        const emailToSave = inviteEmail;
        setInviteEmail("");
        toast({
          title: "Invitation Sent",
          description: `Successfully sent invitation to ${emailToSave}`,
        });
        await loadDashboardData(); // Refresh the client list
      } else {
        const errorText = await response.text();
        console.error("❌ [THERAPIST-DASH] Invite failed:", errorText);
        toast({
          title: "Invitation Failed",
          description: errorText || "Failed to send invitation",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("❌ [THERAPIST-DASH] Invite error:", error);
      toast({
        title: "Error",
        description: "Failed to send invitation. Please try again.",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) {
        setInviting(false);
      }
    }
  };

  const cancelInvitation = async (invitationId: string, email: string) => {
    setCancelingId(invitationId);
    
    // Optimistically remove invitation
    const previousInvitations = [...pendingInvitations];
    setPendingInvitations(prev => prev.filter(inv => inv.id !== invitationId));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Revert on auth failure
        setPendingInvitations(previousInvitations);
        toast({
          title: "Session Expired",
          description: "Please refresh the page and try again.",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`/api/therapist/invitation/${invitationId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        toast({
          title: "Invitation Canceled",
          description: `Canceled invitation for ${email}`,
        });
      } else {
        // Revert on failure
        setPendingInvitations(previousInvitations);
        
        if (response.status === 401) {
          handleLogout(setUserId);
          return;
        }
        
        const errorText = await response.text();
        toast({
          title: "Failed to Cancel",
          description: errorText || "Could not cancel invitation",
          variant: "destructive",
        });
      }
    } catch (error) {
      // Revert on error
      setPendingInvitations(previousInvitations);
      console.error("❌ [THERAPIST-DASH] Cancel error:", error);
      toast({
        title: "Error",
        description: "Failed to cancel invitation",
        variant: "destructive",
      });
    } finally {
      if (mountedRef.current) {
        setCancelingId(null);
      }
    }
  };

  const updateClientTimeLimit = async (clientId: string, minutes: number) => {
    try {
      const seconds = minutes * 60;
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Session Expired",
          description: "Please refresh and try again",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`/api/therapist/client/${clientId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ session_duration_limit: seconds }),
      });

      if (response.ok) {
        toast({
          title: "Time Limit Updated",
          description: `Session limit set to ${minutes} minutes`,
        });

        // ⬇️ ADD THESE 3 LINES - Reload dashboard to show updated value
        if (mountedRef.current) {
          await loadDashboardData();
        }
        // ⬆️ END OF ADDITION

      } else {
        const errorText = await response.text();
        toast({
          title: "Update Failed",
          description: errorText || "Could not update time limit",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating time limit:', error);
      toast({
        title: "Error",
        description: "Failed to update time limit",
        variant: "destructive",
      });
    }
  };

  const totalClientsMinutes = clients.reduce(
    (sum, c) => sum + c.total_minutes,
    0,
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">
            Loading therapist dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center max-w-md">
          <p className="text-lg mb-4 text-red-500">{error}</p>
          <Button onClick={() => window.location.reload()}>Refresh Page</Button>
        </div>
      </div>
    );
  }

  // Calculate subscription values safely
  const minutesRemaining = subscription?.limits?.minutes_remaining || 0;
  const subscriptionTier = subscription?.limits?.subscription_tier || "trial";
  const clientLimit =
    subscriptionTier === "pro"
      ? "Unlimited"
      : subscriptionTier === "plus"
        ? "10"
        : "3";

  console.log(
    `🎨 [THERAPIST-DASH] Rendering dashboard with ${clients.length} clients`,
  );

  return (
    <div className="min-h-screen gradient-bg p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Therapist Dashboard
            </h1>
            {profile && (
              <p className="text-sm text-muted-foreground mt-1">
                {profile.email} • {profile.user_type}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleLogout(setUserId)}
              data-testid="button-signout"
              className="text-sm"
            >
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
                  <p className="text-sm text-muted-foreground">
                    Active Clients
                  </p>
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
            <div className="flex flex-col sm:flex-row gap-2">
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
                className="px-6 w-full sm:w-auto"
              >
                {inviting ? "Sending..." : "Invite Client"}
              </Button>
            </div>

            {/* Pending Invitations */}
            {(invitationsLoading || pendingInvitations.length > 0) && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Pending Invitations {invitationsLoading && <span className="ml-2 text-xs">(Loading...)</span>}
                </h3>
                {invitationsLoading ? (
                  <div className="p-3 rounded-lg glass-subtle">
                    <p className="text-sm text-muted-foreground">Loading invitations...</p>
                  </div>
                ) : pendingInvitations.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-3 rounded-lg glass-subtle border border-yellow-500/20"
                    data-testid={`pending-invite-${invite.id}`}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{invite.client_email}</p>
                      <p className="text-xs text-muted-foreground">
                        Sent {new Date(invite.sent_at).toLocaleDateString()} • 
                        Expires {new Date(invite.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelInvitation(invite.id, invite.client_email)}
                      disabled={cancelingId === invite.id}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      data-testid={`button-cancel-invite-${invite.id}`}
                    >
                      {cancelingId === invite.id ? "Canceling..." : "Cancel"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Clients List */}
            {clients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No clients yet. Invite your first client above.
              </div>
            ) : (
              <div className="space-y-3">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className="p-4 rounded-lg glass-subtle border border-white/10"
                    data-testid={`card-client-${client.id}`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div 
                        className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLocation(`/therapist/client/${client.id}/sessions`)}
                      >
                        <p className="font-medium">{client.full_name}</p>
                        <p className="text-sm text-muted-foreground">{client.email}</p>
                        {client.last_session && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last session: {new Date(client.last_session).toLocaleDateString()}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {client.total_sessions} sessions • {client.total_minutes} minutes
                        </p>
                      </div>

                      {/* Time Limit Control */}
                      <div className="flex items-center gap-2 min-w-[200px]">
                        <label className="text-xs text-muted-foreground whitespace-nowrap">
                          Session limit:
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="120"
                          defaultValue={Math.floor(client.session_duration_limit / 60)}
                          className="w-16 px-2 py-1 text-sm rounded bg-white/5 border border-white/10"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const minutes = parseInt(e.target.value);
                            if (minutes >= 1 && minutes <= 120) {
                              updateClientTimeLimit(client.id, minutes);
                            }
                          }}
                        />
                        <span className="text-xs text-muted-foreground">min</span>
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
