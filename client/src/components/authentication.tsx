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
import vasaLogo from '@assets/iVASA Dark_1759424106928.png';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
  }, []);

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
        if (invitationToken) {
          localStorage.setItem('pendingInvitation', invitationToken);
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
          await supabase.auth.signOut();
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
              userType: authData.user.user_metadata?.user_type || 'individual'
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
      <div className="min-h-screen flex items-center justify-center p-4 gradient-bg">
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
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-bg">
      <div className="w-full max-w-2xl mx-auto px-4">
        {/* Logo and Branding */}
        <div className="text-center mb-8 md:mb-12">
          <div className="flex items-center justify-center mb-4">
            <div className="w-40 md:w-48 h-auto animate-float">
              <img 
                src={vasaLogo} 
                alt="iVASA Logo" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
          <p className="text-muted-foreground text-base md:text-lg px-4">Your Voice. Your Journey. Your AI Therapeutic Assistant</p>
        </div>

        {/* Authentication Form */}
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            <Card className="glass rounded-2xl border-0">
          <CardContent className="p-4 md:p-8">
            <div className="space-y-6">
              {/* ============= NEW: Invitation banner ============= */}
              {invitationMode && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <i className="fas fa-user-plus text-blue-500 mt-1"></i>
                    <div>
                      <p className="font-semibold text-sm">Therapist Invitation</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Create your client account to connect with your therapist
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {/* ================================================= */}

              <div className="text-center relative">
                <h2 className="text-2xl font-semibold mb-2">
                  {invitationMode ? 'Create Client Account' : (mode === 'signup' ? 'Create Account' : 'Welcome Back')}
                </h2>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-muted-foreground">
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
                <div className="text-center">
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
    </div>
  );
}