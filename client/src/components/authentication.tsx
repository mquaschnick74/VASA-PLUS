// client/src/components/authentication.tsx
// UPDATED VERSION - Handles invitation tokens from URL

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import PasswordReset from './PasswordReset';
import { AIDisclosureCard } from './AIDisclosureCard';
import AssessmentIframe from './AssessmentIframe';
import autumnRoadImage from '@assets/autumn-road.jpg';
// RadioGroup removed - user type now pre-selected via gateway page
import { Link, useLocation } from 'wouter';
import { HelpCircle, ArrowLeft } from 'lucide-react';
import Header from '@/components/shared/Header';
import AgentCarousel from '@/components/AgentCarousel';
import { getApiUrl } from '@/lib/platform';
import DemoVoiceCard from './DemoVoiceCard';

interface AuthenticationProps {
  setUserId: (id: string) => void;
  preSelectedUserType?: 'individual' | 'therapist' | 'client';
  onBack?: () => void;
  formOnly?: boolean;
  defaultMode?: 'signin' | 'signup';
}

export default function Authentication({ setUserId, preSelectedUserType, onBack, formOnly, defaultMode }: AuthenticationProps) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode || 'signin');
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [userType, setUserType] = useState<'individual' | 'therapist' | 'client'>(preSelectedUserType || 'individual');
  const [showAssessment, setShowAssessment] = useState(false);

  // Lock body scroll when assessment modal is open
  useEffect(() => {
    if (showAssessment) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showAssessment]);

  // Handle assessment completion - close modal and navigate to signup
  const handleAssessmentComplete = (data: any) => {
    console.log('[Auth] Assessment complete, closing modal and navigating');
    // Close the modal first
    setShowAssessment(false);
    // Store assessment data
    sessionStorage.setItem('assessmentData', JSON.stringify(data));
    // Navigate to signup with encoded profile
    setTimeout(() => {
      setLocation(`/signup?source=assessment&profile=${data.encoded}`);
    }, 100);
  };

  // ============= NEW: Invitation handling state =============
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [therapistId, setTherapistId] = useState<string | null>(null);
  const [invitationMode, setInvitationMode] = useState(false);
  // ==========================================================

  useEffect(() => {
    // Check URL parameters for invitation token
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const therapist = urlParams.get('therapist');

    // ============= NEW: Handle invitation links =============
    if (token && therapist) {
      console.log('Invitation detected:', { token: token.substring(0, 10) + '...', therapist });
      setInvitationToken(token);
      setTherapistId(therapist);
      setInvitationMode(true);
      setMode('signup');  // Force signup mode
      setUserType('client');  // Pre-select client type

      localStorage.setItem('pendingInvitation', token);
    }
    // =======================================================

    // Check if returning from email confirmation
    const hashParams = new URLSearchParams(window.location.hash.substring(1));

    if (hashParams.get('type') === 'signup' || urlParams.get('type') === 'signup') {
      // User just confirmed their email
      setMode('signin');
      setVerificationSent(false);
      setError(null);

      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check URL parameters for mode (signup/signin)
    const urlMode = urlParams.get('mode');
    if (urlMode === 'signup') {
      setMode('signup');
    }
  }, []);

  // ✅ REMOVED: acceptInvitation function - Now handled in Dashboard component
  // Note: Promo codes are now handled directly by Stripe during checkout
  // This ensures invitation is accepted BEFORE any modals appear

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        // Create account with email verification
        // Use environment variable for redirect URL to avoid Replit workspace redirect
        const baseUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
        const redirectUrl = `${baseUrl}/dashboard`;

        console.log('📧 [AUTH] Email verification will redirect to:', redirectUrl);

        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName || email.split('@')[0],
              needs_profile: true,
              user_type: userType
            },
            emailRedirectTo: redirectUrl
          }
        });

        if (signUpError) throw signUpError;

        if (authData.user?.identities?.length === 0) {
          setError('An account with this email already exists. Please sign in instead.');
          return;
        }

        // Show verification message
        setVerificationEmail(email);
        setVerificationSent(true);

        setPassword('');
        setShowPassword(false);
        return;
      } else {
        // Sign in
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (signInError) {
          if (signInError.message.includes('Email not confirmed')) {
            setError('Please confirm your email before signing in. Check your inbox for the verification link.');
            return;
          }
          throw signInError;
        }

        // Check if email is verified
        if (!authData.user?.email_confirmed_at) {
          setError('Please verify your email before signing in. Check your inbox for the verification link.');
          try {
            const { withTimeout } = await import('@/lib/auth-helpers');
            await withTimeout(supabase.auth.signOut(), 3000);
          } catch (error) {
            console.warn('⚠️ SignOut timeout/error (email not verified):', error);
          }
          return;
        }

        // Successfully authenticated & verified
        if (authData.session) {
          const token = authData.session.access_token;
          localStorage.setItem('authToken', token);

          // Try to create/get user profile
          const response = await fetch(getApiUrl('/api/auth/user'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            credentials: 'include',
            body: JSON.stringify({
              email: authData.user.email,
              firstName: authData.user.user_metadata?.first_name,
              authUserId: authData.user.id,
              userType: authData.user.user_metadata?.user_type || 'individual'
            })
          });

          if (response.ok) {
            const { user } = await response.json();
            setUserId(user.id);
            localStorage.setItem('userId', user.id);

            // ✅ UPDATED: Just ensure invitation token is stored, Dashboard will handle acceptance
            // This prevents the assessment modal from interrupting the invitation acceptance flow
            if (invitationToken && !localStorage.getItem('pendingInvitation')) {
              console.log('📝 [AUTH] Storing invitation token for Dashboard to process');
              localStorage.setItem('pendingInvitation', invitationToken);
            }

            console.log('✅ [AUTH] Sign-in complete, Dashboard will now handle invitation acceptance');
            // Dashboard component will process the invitation BEFORE showing any modals
          } else {
            // If profile creation fails, redirect to dashboard anyway
            window.location.href = '/dashboard';
          }
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      setError(error.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showPasswordReset) {
    return <PasswordReset onBack={() => setShowPasswordReset(false)} />;
  }

  if (verificationSent) {
    // Verification sent view - simplified for formOnly mode
    if (formOnly) {
      return (
        <div className="glass rounded-2xl border border-white/10 p-6 md:p-8 w-full">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <i className="fas fa-envelope-circle-check text-3xl text-primary"></i>
            </div>
            <h2 className="text-xl font-semibold mb-3">Check Your Email</h2>

            {invitationMode && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold mb-1">Client Invitation</p>
                <p className="text-xs text-muted-foreground">
                  After verifying your email, you'll be connected to your therapist automatically.
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground mb-1">
              We've sent a verification link to:
            </p>
            <p className="font-semibold text-sm mb-4">{verificationEmail}</p>

            <Button
              onClick={() => {
                setVerificationSent(false);
                setMode('signin');
                setEmail(verificationEmail);
              }}
              variant="outline"
              className="w-full"
            >
              I've Verified My Email - Sign In
            </Button>

            <p className="text-xs text-muted-foreground mt-3">
              Can't find the email? Check your spam folder.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen gradient-bg">
        <Header hideSignInButton={true} />
        <div className="flex items-center justify-center p-4 min-h-[calc(100vh-4rem)]">
        <div className="w-full max-w-md mx-auto px-4">
          <Card className="glass rounded-2xl border-0">
            <CardContent className="p-4 md:p-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
                  <i className="fas fa-envelope-circle-check text-4xl text-primary"></i>
                </div>
                <h2 className="text-2xl font-semibold mb-4">Check Your Email</h2>

                {/* ============= NEW: Special message for invitation signups ============= */}
                {invitationMode && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
                    <p className="text-sm font-semibold mb-2">Client Invitation</p>
                    <p className="text-sm">
                      After verifying your email, you'll be connected to your therapist automatically.
                    </p>
                  </div>
                )}
                {/* ====================================================================== */}

                <p className="text-muted-foreground mb-2">
                  We've sent a verification link to:
                </p>
                <p className="font-semibold mb-6">{verificationEmail}</p>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6 text-left">
                  <p className="text-sm mb-2">
                    <strong>Next steps:</strong>
                  </p>
                  <ol className="text-sm space-y-1 ml-4">
                    <li>1. Click the verification link in your email</li>
                    <li>2. Your email will be confirmed</li>
                    <li>3. Sign in with your email and password</li>
                  </ol>
                </div>

                <Button
                  onClick={() => {
                    setVerificationSent(false);
                    setMode('signin');
                    setEmail(verificationEmail);
                  }}
                  variant="outline"
                  className="w-full"
                >
                  I've Verified My Email - Sign In
                </Button>

                <p className="text-xs text-muted-foreground mt-4">
                  Can't find the email? Check your spam folder or try signing up again.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    );
  }

  // formOnly mode: render just the auth card without the full page layout
  if (formOnly) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6 md:p-8 w-full">
        {/* Free trial banner — only show on signup mode */}
        {mode === 'signup' && (
          <div className="text-center bg-amber-500/10 border border-amber-500/30 rounded-lg py-2 px-3 mb-6">
            <p className="text-sm font-semibold text-amber-400">
              30-Day Free Trial with 180 Minutes — No Credit Card Required
            </p>
          </div>
        )}

        {/* Welcome heading */}
        <h2 className="text-xl font-bold text-white text-center">
          {invitationMode ? 'Create Client Account' : (mode === 'signin' ? 'Welcome Back' : 'Create Your Account')}
        </h2>
        <p className="text-sm text-muted-foreground text-center mt-1 mb-6">
          {mode === 'signin' ? 'Continue your therapeutic journey' : 'Start your 30-day free trial'}
        </p>

        {/* Invitation banner if present */}
        {invitationMode && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-4">
            <div className="flex items-start gap-2">
              <i className="fas fa-user-plus text-blue-500 mt-1 text-sm"></i>
              <div>
                <p className="font-semibold text-xs">Therapist Invitation</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create your client account to connect with your therapist
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-500 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Dual Auth Notice for Signup */}
        {mode === 'signup' && !invitationMode && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm mb-4">
            <i className="fas fa-shield-halved mr-2"></i>
            Email verification required for account security
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Email Address</Label>
            <Input
              type="email"
              placeholder="sarah@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-input border border-border"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-input border border-border pr-12"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => setShowPasswordReset(true)}
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>

          {mode === 'signup' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">First Name (Optional)</Label>
              <Input
                type="text"
                placeholder="Sarah"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-input border border-border"
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-gradient-to-r from-primary to-accent py-3 rounded-xl"
          >
            {loading ? 'Loading...' : (mode === 'signup' ? 'Create Account' : 'Sign In')}
          </Button>
        </form>

        {/* Toggle between signin/signup */}
        {!invitationMode && (
          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() => {
                if (mode === 'signin') {
                  // Go to gateway to choose path
                  setLocation('/');
                } else {
                  setMode('signin');
                  setError(null);
                  setShowPassword(false);
                }
              }}
              className="text-sm hover:opacity-80 transition-opacity"
            >
              {mode === 'signin' ? (
                <>
                  <span className="text-emerald-500">Don't have an account? </span>
                  <span className="text-amber-500 font-semibold">Sign up</span>
                </>
              ) : (
                <>
                  <span className="text-emerald-500">Already have an account? </span>
                  <span className="text-amber-500 font-semibold">Sign in</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Privacy note */}
        <p className="text-xs text-muted-foreground text-center mt-4">
          Your conversations are private and secure
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Assessment Iframe */}
      {showAssessment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAssessment(false)}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-4xl h-[90vh] mx-4 bg-background rounded-2xl shadow-2xl overflow-hidden border border-emerald-400/30">
            {/* Close Button */}
            <button
              onClick={() => setShowAssessment(false)}
              className="absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-emerald-400/30 hover:bg-emerald-400/10 hover:border-emerald-400/60 transition-all duration-200"
            >
              <i className="fas fa-times text-muted-foreground"></i>
            </button>

            {/* Assessment Iframe - full height with scrolling enabled */}
            <div className="w-full h-full overflow-y-auto">
              <AssessmentIframe
                className="w-full min-h-full"
                onComplete={handleAssessmentComplete}
              />
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen gradient-bg relative">
        {/* Back button - absolute positioned */}
        {onBack && (
          <button
            onClick={onBack}
            className="absolute top-4 left-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors z-20"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        )}
        <Header hideSignInButton={true} />
        <div className="flex items-center justify-center p-4 md:p-6 pt-16 md:pt-20">
      <div className="w-full max-w-6xl mx-auto px-4">
        {/* Two-column layout: Logo/Phrases on left, Form on right */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* LEFT COLUMN: Value Proposition + Demo */}
          <div className="flex flex-col items-center justify-center">
            <div className="text-center space-y-4 max-w-lg">
              {/* Context message based on selected user type */}
              {preSelectedUserType === 'therapist' && (
                <p className="text-amber-400 text-sm font-medium mb-2">Therapist Portal</p>
              )}
              {preSelectedUserType === 'individual' && (
                <p className="text-purple-400 text-sm font-medium mb-2">AI Therapy</p>
              )}
              {preSelectedUserType === 'client' && (
                <p className="text-blue-400 text-sm font-medium mb-2">Client Access</p>
              )}
              <h1 className="text-emerald-400 text-2xl md:text-3xl lg:text-4xl font-bold leading-tight">
                Your future is a reflection of your past:
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground font-medium">
                Reveal what you can't see alone, and change it!
              </p>

              {/* Demo Voice Card - only for individual users or when no type is pre-selected */}
              {(!preSelectedUserType || preSelectedUserType === 'individual') && (
                <DemoVoiceCard />
              )}

              <p className="text-xs md:text-sm font-normal max-w-xl mx-auto text-muted-foreground pt-2">
                Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.<sup className="text-[0.6em]">TM</sup>
              </p>
            </div>
          </div>

          {/* RIGHT COLUMN: Authentication Form */}
          <div className="flex justify-center md:justify-end">
            <div className="w-full max-w-md">
            <Card className="glass rounded-2xl border-0">
          <CardContent className="p-5 md:p-7">
            <div className="space-y-5">
              {/* Free Trial Banner */}
              <div className="text-center bg-amber-500/10 border border-amber-500/30 rounded-lg py-2 px-3">
                <p className="text-sm font-semibold text-amber-400">
                  30-Day Free Trial with 180 Minutes — No Credit Card Required
                </p>
              </div>

              {/* ============= NEW: Invitation banner ============= */}
              {invitationMode && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <i className="fas fa-user-plus text-blue-500 mt-1 text-sm"></i>
                    <div>
                      <p className="font-semibold text-xs">Therapist Invitation</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Create your client account to connect with your therapist
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {/* ================================================= */}

              <div className="text-center relative">
                <h2 className="text-xl font-semibold mb-2">
                  {invitationMode ? 'Create Client Account' : (mode === 'signup' ? 'Create Account' : 'Welcome Back')}
                </h2>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    {mode === 'signup' 
                      ? 'Start your therapeutic journey' 
                      : 'Continue your therapeutic journey'}
                  </p>
                  <AIDisclosureCard className="inline-block" />
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-500 text-sm">
                  {error}
                </div>
              )}

              {/* Dual Auth Notice for Signup */}
              {mode === 'signup' && !invitationMode && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm">
                  <i className="fas fa-shield-halved mr-2"></i>
                  Email verification required for account security
                </div>
              )}

              {/* Main Form */}
              <form onSubmit={handleAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email Address</Label>
                  <Input 
                    type="email" 
                    placeholder="sarah@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-input border border-border"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input 
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-input border border-border pr-12"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordReset(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">First Name (Optional)</Label>
                    <Input 
                      type="text" 
                      placeholder="Sarah"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-input border border-border"
                    />
                  </div>
                )}

                {/* User type is now pre-determined via gateway page or invitation link */}

                <Button 
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full bg-gradient-to-r from-primary to-accent py-3 rounded-xl"
                >
                  {loading ? 'Loading...' : (mode === 'signup' ? 'Create Account' : 'Sign In')}
                </Button>
              </form>

              {/* ============= MODIFIED: Hide toggle for invitation mode ============= */}
              {!invitationMode && (
                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === 'signin' ? 'signup' : 'signin');
                      setError(null);
                      setShowPassword(false);
                    }}
                    className="text-sm hover:opacity-80 transition-opacity"
                  >
                    {mode === 'signin' ? (
                      <>
                        <span className="text-emerald-500">Don't have an account? </span>
                        <span className="text-amber-500 font-semibold">Sign up</span>
                      </>
                    ) : (
                      <>
                        <span className="text-emerald-500">Already have an account? </span>
                        <span className="text-amber-500 font-semibold">Sign in</span>
                      </>
                    )}
                  </button>
                </div>
              )}
              {/* ==================================================================== */}

              <div className="text-center text-sm text-muted-foreground">
                <p>Your conversations are private and secure</p>
              </div>
            </div>
          </CardContent>
        </Card>
            </div>
          </div>

        </div>

          {/* Assessment CTA Section */}
          <div className="mt-16 w-full max-w-3xl mx-auto">
            <Card className="glass rounded-2xl border-2 border-emerald-400/60">
              <CardContent className="p-8 md:p-10">
                <div className="text-center space-y-4">
                  <h3 className="text-xl md:text-2xl text-white font-semibold">
                    Complementary Assessment
                  </h3>
                  <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto">
                    Complete 8 questions to better understand how an iVASA guide can assist you.
                  </p>
                  <Button
                    onClick={() => setShowAssessment(true)}
                    className="bg-gradient-to-r from-primary to-accent py-3 px-8 rounded-xl"
                  >
                    Begin...
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Agent Carousel Section */}
          <div className="mt-24 mb-24 w-full overflow-hidden">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold text-emerald-500 mb-4">
                Meet Your AI Therapeutic Guides
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Choose from four specialized AI Guides, each with unique approaches to therapeutic conversation
              </p>
            </div>
            <AgentCarousel />
          </div>

          {/* Features Section - Layered 3D Design */}
          <div className="mt-16 md:mt-24 w-full relative overflow-hidden">
            <div className="relative max-w-5xl mx-auto px-4 md:px-0">

              {/* Background: Envelope-sized autumn road image - 3/4 page width */}
              <div className="relative w-full md:w-3/4 h-[300px] md:h-[500px] rounded-3xl overflow-hidden shadow-2xl">
                <img
                  src={autumnRoadImage}
                  alt="Autumn road"
                  className="w-full h-full object-cover"
                />

                {/* Features Title - Overlaid, positioned lower for symmetry */}
                <div className="absolute top-8 left-6 md:top-24 md:left-12">
                  <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold text-emerald-500 drop-shadow-2xl">
                    Features
                  </h2>
                </div>
              </div>

              {/* Foreground: Feature cards - stacked below image on mobile, overlaid on desktop */}
              <div className="relative mt-6 md:-mt-[480px] flex md:justify-end pr-0 md:pr-8">
                <div className="w-full md:w-2/3 lg:w-1/2 space-y-4 md:space-y-6">

                  {/* Feature 1: Accessible Pricing */}
                  <div className="flex items-start gap-4 glass p-5 rounded-xl shadow-xl backdrop-blur-md bg-background/80 border border-white/20 transform transition-transform hover:scale-105">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-12 h-12 rounded-full bg-blue-500/30 flex items-center justify-center shadow-lg">
                        <i className="fas fa-hand-holding-dollar text-lg text-blue-400"></i>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">
                        Accessible <span className="text-emerald-400">Pricing</span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Starting at $7.99/month vs. traditional therapy averaging $100-200/session
                      </p>
                    </div>
                  </div>

                  {/* Feature 2: Available 24/7 */}
                  <div className="flex items-start gap-4 glass p-5 rounded-xl shadow-xl backdrop-blur-md bg-background/80 border border-white/20 transform transition-transform hover:scale-105">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/30 flex items-center justify-center shadow-lg">
                        <i className="fas fa-clock text-lg text-emerald-400"></i>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">
                        Available <span className="text-emerald-400">24/7</span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Access support whenever and wherever you need (requires internet connection)
                      </p>
                    </div>
                  </div>

                  {/* Feature 3: Personalized Support */}
                  <div className="flex items-start gap-4 glass p-5 rounded-xl shadow-xl backdrop-blur-md bg-background/80 border border-white/20 transform transition-transform hover:scale-105">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-12 h-12 rounded-full bg-purple-500/30 flex items-center justify-center shadow-lg">
                        <i className="fas fa-brain text-lg text-purple-400"></i>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">
                        Personalized <span className="text-emerald-400">Support</span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        AI remembers context from your conversations to provide continuity
                      </p>
                    </div>
                  </div>

                  {/* Feature 4: Customizable Experience */}
                  <div className="flex items-start gap-4 glass p-5 rounded-xl shadow-xl backdrop-blur-md bg-background/80 border border-white/20 transform transition-transform hover:scale-105">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-12 h-12 rounded-full bg-cyan-500/30 flex items-center justify-center shadow-lg">
                        <i className="fas fa-sliders text-lg text-cyan-400"></i>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">
                        Customizable <span className="text-emerald-400">Experience</span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Choose your preferred AI companion and conversation style
                      </p>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </div>
        </div>

        </div>
      </div>
    </>
  );
}