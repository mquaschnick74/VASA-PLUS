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
  const [mode, setMode] = useState<'signin' | 'signup' | 'magiclink'>('signin');
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleMagicLink = async () => {
    if (!email) return;

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/dashboard`
        }
      });

      if (error) throw error;

      setMagicLinkSent(true);
    } catch (error: any) {
      console.error('Magic link error:', error);
      setError(error.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    // If magic link mode, use that instead
    if (mode === 'magiclink') {
      handleMagicLink();
      return;
    }

    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      let authResult;

      if (mode === 'signup') {
        // Create new account
        authResult = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { first_name: firstName || email.split('@')[0] }
          }
        });

        if (authResult.error) throw authResult.error;

        if (authResult.data.user?.identities?.length === 0) {
          setError('An account with this email already exists. Please sign in instead.');
          return;
        }

        // Show success message
        alert('Check your email to confirm your account! After confirming, come back here to sign in.');
        setMode('signin');
        setPassword('');
        setShowPassword(false);
        return;
      } else {
        // Sign in
        authResult = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (authResult.error) throw authResult.error;
      }

      // Successfully authenticated
      if (authResult.data.user && authResult.data.session) {
        const token = authResult.data.session.access_token;
        localStorage.setItem('authToken', token);
        window.location.href = '/dashboard';
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

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 gradient-bg">
        <div className="w-full max-w-md">
          <Card className="glass rounded-2xl border-0">
            <CardContent className="p-8 text-center">
              <div className="mb-6">
                <i className="fas fa-envelope text-4xl text-primary mb-4"></i>
                <h2 className="text-2xl font-semibold mb-2">Check Your Email!</h2>
                <p className="text-muted-foreground">
                  We sent a magic link to <strong>{email}</strong>
                </p>
                <p className="text-muted-foreground mt-2">
                  Click the link in the email to sign in instantly.
                </p>
              </div>
              <button
                onClick={() => {
                  setMagicLinkSent(false);
                  setMode('signin');
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </button>
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
                  {mode === 'signup' ? 'Create Account' : 
                   mode === 'magiclink' ? 'Passwordless Sign In' : 'Welcome Back'}
                </h2>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-muted-foreground">
                    {mode === 'signup' 
                      ? 'Start your therapeutic journey' 
                      : mode === 'magiclink'
                      ? 'Sign in with just your email'
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

                {mode !== 'magiclink' && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Input 
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 pr-12 rounded-xl bg-input border border-border"
                        required={mode !== 'magiclink'}
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
                )}

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
                  disabled={loading || !email || (mode !== 'magiclink' && !password)}
                  className="w-full bg-gradient-to-r from-primary to-accent py-3 rounded-xl"
                >
                  {loading ? 'Loading...' : 
                   mode === 'signup' ? 'Create Account' : 
                   mode === 'magiclink' ? 'Send Magic Link' : 'Sign In'}
                </Button>
              </form>

              <div className="text-center space-y-2">
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => setMode('magiclink')}
                    className="block w-full text-sm text-primary hover:text-accent transition-colors"
                  >
                    🪄 Sign in without password (Magic Link)
                  </button>
                )}

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
                    : mode === 'magiclink'
                    ? "Back to regular sign in"
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