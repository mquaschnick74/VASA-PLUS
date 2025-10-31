// Location: client/src/pages/dashboard.tsx
// FIXED VERSION - Prevents unexpected signouts and handles auth properly

import { useState, useEffect, useRef } from 'react';
import Authentication from '@/components/authentication';
import VoiceInterface from '@/components/voice-interface';
import ClientDashboard from '@/pages/client-dashboard';
import ConsentPopup from '@/components/ConsentPopup';
import OnboardingQuestionnaire from '@/components/OnboardingQuestionnaire';
import TherapistDashboard from '@/pages/therapist-dashboard';
import PartnerDashboard from '@/pages/partner-dashboard';
import InfluencerDashboard from '@/pages/influencer-dashboard';
import AdminDashboard from '@/pages/admin-dashboard';
import { supabase } from '@/lib/supabaseClient';
import { handleLogout } from '@/lib/auth-helpers';

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userType, setUserType] = useState<string>('individual');
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const authListenerRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const isSignedInRef = useRef(false);
  const lastEventRef = useRef<string>('');

  const ensureUserProfile = async (session: any) => {
    // Try to get current session first
    let freshSession = session;
    
    // If no session passed or session might be stale, get fresh one
    if (!freshSession) {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      freshSession = currentSession;
    }
    
    if (!freshSession || !freshSession.user?.email) {
      console.error('❌ [DASHBOARD] No valid session found');
      return null;
    }

    const token = freshSession.access_token;

    try {
      const apiUrl = '/api/auth/user';
      console.log('🔐 [DASHBOARD] Calling API:', apiUrl);

      // Check for pending promo code from signup
      const pendingPromoCode = localStorage.getItem('pendingPromoCode');
      if (pendingPromoCode) {
        console.log('🎟️ [DASHBOARD] Found pending promo code:', pendingPromoCode);
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: freshSession.user.email,
          firstName: freshSession.user.user_metadata?.first_name || freshSession.user.email.split('@')[0],
          authUserId: freshSession.user.id,
          userType: freshSession.user.user_metadata?.user_type || 'individual',
          promoCode: pendingPromoCode || null
        })
      });

      console.log('✅ [DASHBOARD] API Response status:', response.status);

      if (response.ok) {
        const { user } = await response.json();
        console.log('👤 [DASHBOARD] User received from API:', user);

        // Store user info
        localStorage.setItem('userId', user.id);
        localStorage.setItem('userEmail', user.email || session.user.email);
        localStorage.setItem('lastAuthCheck', new Date().toISOString());

        // Clear pending promo code after successful user creation
        if (pendingPromoCode) {
          console.log('✅ [DASHBOARD] Clearing pending promo code');
          localStorage.removeItem('pendingPromoCode');
        }

        // Get user profile to determine type
        const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_type, email, consent_accepted_at, last_onboarding_completed_at')
        .eq('id', user.id)
        .single();

        if (profile) {
          const detectedType = profile.user_type || 'individual';
          console.log(`✅ [DASHBOARD] User type detected: ${detectedType} for ${profile.email}`);

          // Only update state if component is still mounted
          if (mountedRef.current) {
            setUserType(detectedType);
            setUserEmail(profile.email);
            isSignedInRef.current = true;

            // CHECK FOR CONSENT - NEW CODE
            if (!profile.consent_accepted_at) {
              console.log('⚠️ [DASHBOARD] Consent not yet accepted, showing popup');
              setShowConsent(true);
            } else {
              console.log('✅ [DASHBOARD] Consent already accepted');
              setConsentChecked(true);

              // SHOW ONBOARDING - For individuals, clients, and therapists
              // Check sessionStorage to prevent repeated showing during navigation
              const onboardingCompletedThisSession = sessionStorage.getItem('onboarding_completed_this_session');

              if (detectedType === 'individual' || detectedType === 'client' || detectedType === 'therapist') {
                if (onboardingCompletedThisSession === 'true') {
                  console.log('✅ [DASHBOARD] Onboarding already completed this session, skipping');
                  setOnboardingChecked(true);
                } else {
                  console.log('⚠️ [DASHBOARD] Showing onboarding questionnaire for user type:', detectedType);
                  setShowOnboarding(true);
                }
              } else {
                console.log('✅ [DASHBOARD] Onboarding not required for user type:', detectedType);
                setOnboardingChecked(true);
              }
            }
          }
        }

        // Check for pending invitation
        const pendingToken = localStorage.getItem('pendingInvitation');
        if (pendingToken) {
          console.log('Processing pending invitation...');

          const inviteResponse = await fetch('/api/therapist/accept-invitation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ token: pendingToken })
          });

          if (inviteResponse.ok) {
            console.log('✅ Invitation accepted successfully');
            localStorage.removeItem('pendingInvitation');
          } else {
            console.error('Failed to accept invitation:', await inviteResponse.json());
          }
        }

        return user.id;
      } else {
        const errorText = await response.text();
        console.error('❌ [DASHBOARD] Profile API error:', response.status, errorText);
        setMessage(`API Error (${response.status}): ${errorText.substring(0, 100)}`);
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('❌ [DASHBOARD] Profile operation failed:', error);
      setMessage(`Connection error: ${errorMessage}`);
      return null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    isSignedInRef.current = false;

    const setupAuth = async () => {
      console.log('🚀 [DASHBOARD] Setting up auth management');

      try {
        // Check for existing session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('❌ [DASHBOARD] Session error:', sessionError);
          setLoading(false);
          return;
        }

        if (session && session.user.email_confirmed_at) {
          console.log('✅ [DASHBOARD] Existing session found for:', session.user.email);

          const profileId = await ensureUserProfile(session);
          if (profileId && mountedRef.current) {
            setUserId(profileId);
            setMessage(null);
            isSignedInRef.current = true;
          }
        } else {
          console.log('ℹ️ [DASHBOARD] No active session. Waiting for sign in.');
          setLoading(false);
        }

        // Set up auth listener with better event handling
        if (!authListenerRef.current) {
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            const eventKey = `${event}-${session?.user?.email || 'none'}-${Date.now()}`;

            // Log all events for debugging
            console.log(`🔄 [DASHBOARD] Auth event: ${event}`, {
              email: session?.user?.email,
              isSignedIn: isSignedInRef.current,
              lastEvent: lastEventRef.current
            });

            // Skip duplicate events
            if (lastEventRef.current === eventKey) {
              console.log('⏭️ [DASHBOARD] Skipping duplicate event');
              return;
            }
            lastEventRef.current = eventKey;

            // Skip initial session - we handle it above
            if (event === 'INITIAL_SESSION') {
              console.log('⏭️ [DASHBOARD] Skipping INITIAL_SESSION');
              return;
            }

            // Only process if component is mounted
            if (!mountedRef.current) {
              console.log('⚠️ [DASHBOARD] Component unmounted, ignoring event');
              return;
            }

            if (event === 'SIGNED_OUT') {
              const intentional = sessionStorage.getItem('intentionalSignOut');

              if (intentional === 'true') {
                console.log('✅ [DASHBOARD] Intentional sign-out detected - cleaning up');
                sessionStorage.removeItem('intentionalSignOut');
                setUserId(null);
                setUserType('individual');
                isSignedInRef.current = false;
                setLoading(false);
                // Don't redirect here - handleLogout already does that
                return;
              }

              // If not intentional, check if user was actually signed in
              if (!isSignedInRef.current) {
                console.log('⏭️ [DASHBOARD] Ignoring SIGNED_OUT - user was not signed in');
                return;
              }

              // Unexpected signout - treat as session loss
              console.log('⚠️ [DASHBOARD] Unexpected SIGNED_OUT - clearing state');
              setUserId(null);
              setUserType('individual');
              isSignedInRef.current = false;
              setLoading(false);

            } else if (event === 'SIGNED_IN' && session) {
              console.log('🔐 [DASHBOARD] Processing SIGNED_IN event');

              if (!session.user.email_confirmed_at) {
                setMessage('Please verify your email to continue');
                await supabase.auth.signOut();
                setUserId(null);
                isSignedInRef.current = false;
                setLoading(false);
                return;
              }

              const profileId = await ensureUserProfile(session);
              if (profileId && mountedRef.current) {
                setUserId(profileId);
                setMessage(null);
                isSignedInRef.current = true;
              }
              setLoading(false);

            } else if (event === 'TOKEN_REFRESHED') {
              console.log('🔄 [DASHBOARD] Token refreshed');
              localStorage.setItem('lastAuthCheck', new Date().toISOString());

            } else if (event === 'USER_UPDATED') {
              console.log('👤 [DASHBOARD] User updated');
              if (session) {
                await ensureUserProfile(session);
              }
            }
          });

          authListenerRef.current = subscription;
        }
      } catch (error) {
        console.error('❌ [DASHBOARD] Auth setup error:', error);
        setMessage('Authentication error. Check console for details.');
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    setupAuth();

    // Cleanup
    return () => {
      console.log('🔚 [DASHBOARD] Cleaning up');
      mountedRef.current = false;
      if (authListenerRef.current) {
        authListenerRef.current.unsubscribe();
        authListenerRef.current = null;
      }
    };
  }, []);

  // Periodic session check to prevent unexpected signouts
  useEffect(() => {
    if (!userId) return;

    const checkInterval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        console.log('✅ [DASHBOARD] Session still active');
        localStorage.setItem('lastAuthCheck', new Date().toISOString());
      } else if (isSignedInRef.current) {
        console.log('⚠️ [DASHBOARD] Session lost - signing out');
        handleLogout(setUserId);
        isSignedInRef.current = false;
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(checkInterval);
  }, [userId]);

  // Handle consent acceptance
  const handleConsentAccepted = async () => {
    console.log('✅ [DASHBOARD] Consent accepted');
    setShowConsent(false);
    setConsentChecked(true);

    // Show onboarding for individuals, clients, and therapists
    // Check sessionStorage to prevent repeated showing during navigation
    const onboardingCompletedThisSession = sessionStorage.getItem('onboarding_completed_this_session');

    if (userType === 'individual' || userType === 'client' || userType === 'therapist') {
      if (onboardingCompletedThisSession === 'true') {
        console.log('✅ [DASHBOARD] Onboarding already completed this session, skipping');
        setOnboardingChecked(true);
      } else {
        console.log('⚠️ [DASHBOARD] Showing onboarding questionnaire for user type:', userType);
        setShowOnboarding(true);
      }
    } else {
      setOnboardingChecked(true);
    }
  };

  // Handle onboarding completion
  const handleOnboardingCompleted = () => {
    console.log('✅ [DASHBOARD] Onboarding completed');
    // Set sessionStorage flag to prevent re-showing during navigation
    sessionStorage.setItem('onboarding_completed_this_session', 'true');
    setShowOnboarding(false);
    setOnboardingChecked(true);
  };

  // ============================================================================
  // ADMIN VIEW-AS MODE
  // ============================================================================
  const viewAsData = sessionStorage.getItem('adminViewAs');
  if (viewAsData && userId) {
    const { targetUserId, targetUserType, viewAsName } = JSON.parse(viewAsData);

    return (
      <div className="min-h-screen gradient-bg">
        <div className="bg-yellow-400 text-black p-3 flex justify-between items-center">
          <span className="font-semibold">
            👁️ Viewing as {targetUserType}: <strong>{viewAsName}</strong>
          </span>
          <button
            onClick={() => {
              sessionStorage.removeItem('adminViewAs');
              window.location.reload();
            }}
            className="bg-black text-yellow-400 px-4 py-2 rounded font-semibold hover:bg-gray-800"
          >
            ← Return to Admin Dashboard
          </button>
        </div>

        <div>
          {targetUserType === 'partner' && <PartnerDashboard userId={targetUserId} setUserId={setUserId} />}
          {targetUserType === 'influencer' && <InfluencerDashboard userId={targetUserId} setUserId={setUserId} />}
          {targetUserType === 'therapist' && <TherapistDashboard userId={targetUserId} setUserId={setUserId} />}
          {targetUserType === 'client' && <ClientDashboard userId={targetUserId} setUserId={setUserId} />}
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show message if exists but no user
  if (message && !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center max-w-md">
          <p className="text-lg mb-4">{message}</p>
          <button 
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.reload();
            }}
            className="text-primary hover:underline"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  // Show auth if no user
  if (!userId) {
    return <Authentication setUserId={setUserId} />;
  }

  // Show consent popup if not yet accepted
  if (showConsent) {
    return <ConsentPopup userId={userId} userEmail={userEmail} onConsentAccepted={handleConsentAccepted} />;
  }

  // Wait for consent check to complete before showing dashboard
  if (!consentChecked && !showConsent) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking account status...</p>
        </div>
      </div>
    );
  }

  // Show onboarding questionnaire for individuals, clients, and therapists
  if (showOnboarding) {
    return <OnboardingQuestionnaire userId={userId} onComplete={handleOnboardingCompleted} />;
  }

  // Wait for onboarding check to complete before showing dashboard
  const shouldShowOnboarding = userType === 'individual' || userType === 'client' || userType === 'therapist';
  if (!onboardingChecked && !showOnboarding && shouldShowOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Preparing your experience...</p>
        </div>
      </div>
    );
  }

  // Route based on user type
  console.log(`🎯 [DASHBOARD] Routing to ${userType} dashboard for user ${userId}`);

  switch(userType) {
    case 'admin':  // ← ADD THIS CASE FIRST
      return <AdminDashboard userId={userId} setUserId={setUserId} />;
    case 'influencer':
      return <InfluencerDashboard userId={userId} setUserId={setUserId} />;
    case 'partner':  // ← ADD THIS CASE FIRST
      return <PartnerDashboard userId={userId} setUserId={setUserId} />;
    case 'therapist':
      return <TherapistDashboard userId={userId} setUserId={setUserId} />;
    case 'client':
      return <ClientDashboard userId={userId} setUserId={setUserId} />;
    default:
      return <VoiceInterface userId={userId} setUserId={setUserId} />;
  }
}