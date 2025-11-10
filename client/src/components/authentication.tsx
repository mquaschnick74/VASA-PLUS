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
import AssessmentModal from './AssessmentModal';
import vasaLogo from '@assets/iVASA Dark Purple_1762353221689.png';
import autumnRoadImage from '@assets/autumn-road.jpg';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Link } from 'wouter';
import { HelpCircle } from 'lucide-react';
import Header from '@/components/shared/Header';
import AgentCarousel from '@/components/AgentCarousel';

interface AuthenticationProps {
  setUserId: (id: string) => void;
}

export default function Authentication({ setUserId }: AuthenticationProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [userType, setUserType] = useState<'individual' | 'therapist' | 'client'>('individual');
  const [promoCode, setPromoCode] = useState('');
  const [promoValidation, setPromoValidation] = useState<{
    valid: boolean;
    message: string;
    influencerName?: string;
  } | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);

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

    // Check URL parameters for promo code
    const urlPromoCode = urlParams.get('promo');
    if (urlPromoCode) {
      console.log('Promo code detected in URL:', urlPromoCode);
      setPromoCode(urlPromoCode.toUpperCase());
      setMode('signup'); // Force signup mode when promo code present

      // Auto-validate the promo code
      validatePromoCode(urlPromoCode);
    }

    // 🆕 CHECK LOCALSTORAGE FOR SAVED PROMO CODE (from previous signup)
    const savedPromo = localStorage.getItem('pendingPromoCode');
    if (savedPromo && !urlPromoCode) {  // Only use saved if no URL promo
      console.log('Found saved promo code:', savedPromo);
      setPromoCode(savedPromo);
      validatePromoCode(savedPromo);
    }
  }, []);

  // ============================================================================
  // PROMO CODE VALIDATION FUNCTION
  // ============================================================================
  const validatePromoCode = async (code: string) => {
    if (!code || code.trim().length === 0) {
      setPromoValidation(null);
      return;
    }

    setValidatingPromo(true);
    
    try {
      const response = await fetch('/api/auth/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promoCode: code })
      });

      const result = await response.json();
      
      if (result.valid) {
        setPromoValidation({
          valid: true,
          message: result.message,
          influencerName: result.influencer.name
        });
      } else {
        setPromoValidation({
          valid: false,
          message: result.error || 'Invalid promo code'
        });
      }
    } catch (error) {
      console.error('Promo validation error:', error);
      setPromoValidation({
        valid: false,
        message: 'Failed to validate promo code'
      });
    } finally {
      setValidatingPromo(false);
    }
  };

  // ============= NEW: Function to accept invitation after signup =============
  const acceptInvitation = async (token: string, userId: string) => {
    try {
      console.log('Accepting invitation with token:', token.substring(0, 10) + '...');

      const authToken = (await supabase.auth.getSession()).data.session?.access_token;
      if (!authToken) {
        console.error('No auth token available');
        return false;
      }

      const response = await fetch('/api/therapist/accept-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ token })
      });

      if (response.ok) {
        console.log('✅ Invitation accepted successfully');
        return true;
      } else {
        const errorData = await response.json();
        console.error('Failed to accept invitation:', errorData);
        return false;
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      return false;
    }
  };
  // ===========================================================================

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        // Create account with email verification
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
              first_name: firstName || email.split('@')[0],
              needs_profile: true,
              user_type: userType
            },
            emailRedirectTo: `${window.location.origin}/dashboard`
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

        // NEW: Store invitation token so we can use it after email verification
        if (promoCode && promoValidation?.valid) {
          localStorage.setItem('pendingPromoCode', promoCode);
        }

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
          const response = await fetch('/api/auth/user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              email: authData.user.email,
              firstName: authData.user.user_metadata?.first_name,
              authUserId: authData.user.id,
              userType: authData.user.user_metadata?.user_type || 'individual',
              promoCode: promoCode || null
            })
          });

          if (response.ok) {
            const { user } = await response.json();
            setUserId(user.id);
            localStorage.setItem('userId', user.id);

            // ============= NEW: Accept invitation if signing in from invitation link OR after signup =============
            const storedToken = localStorage.getItem('pendingInvitation');
            if (invitationToken || storedToken) {
              const tokenToUse = (invitationToken || storedToken)!;
              console.log('Sign-in completed, now accepting invitation...');
              await acceptInvitation(tokenToUse, user.id);
              localStorage.removeItem('pendingInvitation'); // Clear after use
            }
            // =====================================================================================================
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

  return (
    <>
      {/* Assessment Modal */}
      <AssessmentModal
        isOpen={showAssessmentModal}
        onClose={() => setShowAssessmentModal(false)}
        userEmail={email}
      />

      <div className="min-h-screen gradient-bg">
        <Header hideSignInButton={true} />
        <div className="flex items-center justify-center p-4 md:p-6 pt-16 md:pt-20">
      <div className="w-full max-w-6xl mx-auto px-4">
        {/* Two-column layout: Logo/Phrases on left, Form on right */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          
          {/* LEFT COLUMN: Branding */}
          <div className="flex flex-col items-center justify-center">
            <div className="text-center space-y-6">
              <p className="text-emerald-500 text-lg md:text-xl lg:text-2xl font-medium">Your Voice.</p>
              <p className="text-emerald-500 text-2xl md:text-3xl lg:text-4xl font-semibold">Your Journey.</p>
              <p className="text-emerald-500 text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">Your AI Therapeutic Guide.</p>
              <p className="text-xs md:text-sm font-normal max-w-xl mx-auto text-muted-foreground">
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

                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Promo Code (Optional)
                    </Label>
                    <div className="relative">
                      <Input 
                        type="text" 
                        placeholder="Enter promo code"
                        value={promoCode}
                        onChange={(e) => {
                          const value = e.target.value.toUpperCase();
                          setPromoCode(value);
                          
                          // Validate on change (debounced)
                          if (value.length >= 4) {
                            validatePromoCode(value);
                          } else {
                            setPromoValidation(null);
                          }
                        }}
                        className="w-full px-4 py-3 rounded-xl bg-input border border-border pr-12"
                        maxLength={20}
                      />
                      {validatingPromo && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <i className="fas fa-spinner fa-spin text-muted-foreground"></i>
                        </div>
                      )}
                      {!validatingPromo && promoValidation && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {promoValidation.valid ? (
                            <i className="fas fa-check-circle text-green-500"></i>
                          ) : (
                            <i className="fas fa-times-circle text-red-500"></i>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Validation message */}
                    {promoValidation && (
                      <div className={`text-xs ${promoValidation.valid ? 'text-green-500' : 'text-red-500'}`}>
                        {promoValidation.message}
                      </div>
                    )}
                    
                    {/* Helpful hint */}
                    {!promoCode && (
                      <p className="text-xs text-muted-foreground">
                        Have a promo code? Enter it to support your favorite creator!
                      </p>
                    )}
                  </div>
                )}

                {/* ============= MODIFIED: Hide user type selection for invitations ============= */}
                {mode === 'signup' && !invitationMode && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Account Type</Label>
                    <RadioGroup value={userType} onValueChange={(value: any) => setUserType(value)} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="individual" id="individual" />
                        <Label htmlFor="individual" className="cursor-pointer font-normal">
                          Individual (Personal Use)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="therapist" id="therapist" />
                        <Label htmlFor="therapist" className="cursor-pointer font-normal">
                          Therapist (Manage Clients)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="client" id="client" />
                        <Label htmlFor="client" className="cursor-pointer font-normal">
                          Client (Invited by Therapist)
                        </Label>
                      </div>
                    </RadioGroup>
                    <p className="text-xs text-muted-foreground">
                      {userType === 'therapist' && "You'll be able to invite and manage clients"}
                      {userType === 'client' && "You'll need an invitation code from your therapist"}
                      {userType === 'individual' && "For personal therapeutic sessions"}
                    </p>
                  </div>
                )}
                {/* =============================================================================== */}

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
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {mode === 'signin' 
                      ? "Don't have an account? Sign up" 
                      : 'Already have an account? Sign in'}
                  </button>
                  <p className="text-xs text-emerald-500 font-medium">
                    7 day free trial, No credit card required.
                  </p>
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
                    Complete 5 questions to better understand how an iVASA guide can assist you.
                  </p>
                  <Button
                    onClick={() => setShowAssessmentModal(true)}
                    className="bg-gradient-to-r from-primary to-accent py-3 px-8 rounded-xl"
                  >
                    Begin.
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Agent Carousel Section */}
          <div className="mt-24 mb-24 w-full">
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
          <div className="mt-16 md:mt-24 w-full relative">
            <div className="relative max-w-5xl mx-auto">
              
              {/* Background: Envelope-sized autumn road image - 3/4 page width */}
              <div className="relative w-3/4 h-[400px] md:h-[500px] rounded-3xl overflow-hidden shadow-2xl">
                <img
                  src={autumnRoadImage}
                  alt="Autumn road"
                  className="w-full h-full object-cover"
                />
                
                {/* Features Title - Overlaid, positioned lower for symmetry */}
                <div className="absolute top-16 left-8 md:top-24 md:left-12">
                  <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold text-emerald-500 drop-shadow-2xl">
                    Features
                  </h2>
                </div>
              </div>

              {/* Foreground: Feature cards stacked higher, last card mostly off photo */}
              <div className="relative -mt-[420px] md:-mt-[480px] flex justify-end pr-4 md:pr-8">
                <div className="w-full md:w-2/3 lg:w-1/2 space-y-6">

                  {/* Feature 1: Extremely Affordable */}
                  <div className="flex items-start gap-4 glass p-5 rounded-xl shadow-xl backdrop-blur-md bg-background/80 border border-white/20 transform transition-transform hover:scale-105">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-12 h-12 rounded-full bg-blue-500/30 flex items-center justify-center shadow-lg">
                        <i className="fas fa-hand-holding-dollar text-lg text-blue-400"></i>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">
                        Extremely <span className="text-emerald-400">Affordable</span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Low cost therapy, small fraction of the cost of traditional therapy
                      </p>
                    </div>
                  </div>

                  {/* Feature 2: Always Available */}
                  <div className="flex items-start gap-4 glass p-5 rounded-xl shadow-xl backdrop-blur-md bg-background/80 border border-white/20 transform transition-transform hover:scale-105">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/30 flex items-center justify-center shadow-lg">
                        <i className="fas fa-clock text-lg text-emerald-400"></i>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">
                        Always <span className="text-emerald-400">Available</span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Access therapy 24/7 whenever and wherever you need
                      </p>
                    </div>
                  </div>

                  {/* Feature 3: Personalized Therapist */}
                  <div className="flex items-start gap-4 glass p-5 rounded-xl shadow-xl backdrop-blur-md bg-background/80 border border-white/20 transform transition-transform hover:scale-105">
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-12 h-12 rounded-full bg-purple-500/30 flex items-center justify-center shadow-lg">
                        <i className="fas fa-brain text-lg text-purple-400"></i>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">
                        Personalized <span className="text-emerald-400">Therapist</span>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Therapist learns more about you with every conversation
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
                        Choose how you want your therapist to be
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