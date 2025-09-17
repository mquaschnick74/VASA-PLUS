// Location: client/src/components/authentication.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';
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
  const [mode, setMode] = useState<'signin' | 'signup' | 'legacy'>('signin');
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  // Legacy auth for existing users without passwords
  const handleLegacyAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('POST', '/api/auth/user', { email, firstName });
      const data = await response.json();

      if (data.user) {
        setUserId(data.user.id);
        localStorage.setItem('userId', data.user.id);
      }
    } catch (error) {
      console.error('Sign in error:', error);
      setError('Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // New password-based auth
  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      let authResult;

      if (mode === 'signup') {
        // Create new account with password
        authResult = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { first_name: firstName || email.split('@')[0] },
            emailRedirectTo: `${window.location.origin}/confirm`  // Changed from /dashboard
          }
        });
      } else {
        // Sign in with password
        authResult = await supabase.auth.signInWithPassword({
          email,
          password
        });
      }

      if (authResult.error) {
        // If sign in fails, check if this is a legacy user
        if (mode === 'signin' && authResult.error.message.includes('Invalid login')) {
          setError('No password set for this account. Use "Sign in without password" below.');
          return;
        }
        throw authResult.error;
      }

      // Get or create user profile in your database
      if (authResult.data.user) {
        const token = authResult.data.session?.access_token;
        const response = await apiRequest('POST', '/api/auth/user-with-auth', {
          email,
          firstName: firstName || authResult.data.user.user_metadata?.first_name,
          authUserId: authResult.data.user.id
        }, {
          'Authorization': `Bearer ${token}`
        });

        const data = await response.json();
        if (data.user) {
          setUserId(data.user.id);
          localStorage.setItem('userId', data.user.id);
          // Store the auth token for future API calls
          localStorage.setItem('authToken', token || '');
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      setError(error.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Determine which form to show
  const isLegacyMode = mode === 'legacy';

  if (showPasswordReset) {
    return <PasswordReset onBack={() => setShowPasswordReset(false)} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-bg">
      <div className="w-full max-w-md">
        {/* Logo and Branding */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 animate-float">
            <img 
              src={vasaLogo} 
              alt="VASA Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
            iVASA
          </h1>
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

              {/* Main Form */}
              <form onSubmit={isLegacyMode ? handleLegacyAuth : handlePasswordAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Email Address</Label>
                  <Input 
                    type="email" 
                    placeholder="sarah@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-200"
                    data-testid="input-email"
                    required
                  />
                </div>

                {/* Password field - only show for password-based auth */}
                {!isLegacyMode && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Password</Label>
                    <Input 
                      type="password" 
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-200"
                      data-testid="input-password"
                      required={!isLegacyMode}
                      minLength={6}
                    />
                    {mode === 'signup' && (
                      <p className="text-xs text-muted-foreground">Minimum 6 characters</p>
                    )}
                    {!isLegacyMode && mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => setShowPasswordReset(true)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors text-right w-full"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                )}

                {/* First Name field - show for signup or legacy */}
                {(mode === 'signup' || isLegacyMode) && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">First Name (Optional)</Label>
                    <Input 
                      type="text" 
                      placeholder="Sarah"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all duration-200"
                      data-testid="input-firstName"
                    />
                  </div>
                )}

                <Button 
                  type="submit"
                  disabled={loading || !email || (!isLegacyMode && !password)}
                  className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground font-medium py-3 px-4 rounded-xl hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-all duration-200"
                  data-testid="button-continue"
                >
                  {loading ? 'Loading...' : (
                    mode === 'signup' ? 'Create Account' : 
                    isLegacyMode ? 'Continue to VASA' : 'Sign In'
                  )}
                </Button>
              </form>

              {/* Mode Switch Links */}
              <div className="space-y-2 text-center">
                {!isLegacyMode && (
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors block w-full"
                  >
                    {mode === 'signin' 
                      ? "Don't have an account? Sign up" 
                      : 'Already have an account? Sign in'}
                  </button>
                )}

                {/* Legacy auth option */}
                <button
                  type="button"
                  onClick={() => setMode(isLegacyMode ? 'signin' : 'legacy')}
                  className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors block w-full"
                >
                  {isLegacyMode 
                    ? 'Back to sign in with password' 
                    : 'Sign in without password (legacy)'}
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