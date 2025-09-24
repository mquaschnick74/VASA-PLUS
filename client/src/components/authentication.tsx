// Location: client/src/components/authentication.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import PasswordReset from './PasswordReset';
import { AIDisclosureCard } from './AIDisclosureCard';
import vasaLogo from '@assets/VASA Favi Minimal_1758122988999.png';

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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        // DUAL AUTH STEP 1: Create account with email verification
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { 
              first_name: firstName || email.split('@')[0],
              needs_profile: true  // Flag for profile creation
            },
            emailRedirectTo: `${window.location.origin}/dashboard`
          }
        });

        if (signUpError) throw signUpError;

        if (authData.user?.identities?.length === 0) {
          setError('An account with this email already exists. Please sign in instead.');
          return;
        }

        // DUAL AUTH STEP 2: Show verification message
        setVerificationSent(true);
        setPassword('');
        setShowPassword(false);
        return;
      } else {
        // Sign in with dual verification
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

        // Successfully authenticated & verified - create/get profile
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
              authUserId: authData.user.id
            })
          });

          if (response.ok) {
            const { user } = await response.json();
            setUserId(user.id);
            localStorage.setItem('userId', user.id);
          } else {
            // If profile creation fails, still let them in but flag it
            console.error('Profile creation failed, continuing anyway');
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
        <div className="w-full max-w-md">
          <Card className="glass rounded-2xl border-0">
            <CardContent className="p-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6">
                  <i className="fas fa-envelope-circle-check text-4xl text-primary"></i>
                </div>
                <h2 className="text-2xl font-semibold mb-4">Verify Your Email</h2>
                <p className="text-muted-foreground mb-2">
                  We've sent a verification link to:
                </p>
                <p className="font-semibold mb-6">{email}</p>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                  <p className="text-sm">
                    <strong>Important:</strong> Click the link in your email to verify your account. 
                    After verification, return here and sign in with your password.
                  </p>
                </div>

                <Button
                  onClick={() => {
                    setVerificationSent(false);
                    setMode('signin');
                  }}
                  className="w-full bg-gradient-to-r from-primary to-accent py-3 rounded-xl"
                >
                  Back to Sign In
                </Button>

                <p className="text-xs text-muted-foreground mt-4">
                  Didn't receive the email? Check your spam folder or try signing up again.
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
      <div className="w-full max-w-md">
        {/* Logo and Branding */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 animate-float">
              <img 
                src={vasaLogo} 
                alt="iVASA Logo" 
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              iVASA
            </h1>
          </div>
          <p className="text-muted-foreground text-lg">Your Voice. Your Journey.</p>
          <p className="text-muted-foreground text-lg">Your AI Therapeutic Assistant</p>
        </div>

        {/* Authentication Form */}
        <Card className="glass rounded-2xl border-0">
          <CardContent className="p-8">
            <div className="space-y-6">
              <div className="text-center relative">
                <h2 className="text-2xl font-semibold mb-2">
                  {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
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
              {mode === 'signup' && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm">
                  <i className="fas fa-shield-halved mr-2"></i>
                  Dual authentication: Email verification required
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
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 pr-12 rounded-xl bg-input border border-border"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-lg`}></i>
                    </button>
                  </div>
                  {mode === 'signup' && (
                    <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                  )}
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordReset(true)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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

              <div className="text-center text-sm text-muted-foreground">
                <p>Your conversations are private and secure</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}