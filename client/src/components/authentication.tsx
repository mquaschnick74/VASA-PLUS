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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

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
            data: { first_name: firstName || email.split('@')[0] },
            emailRedirectTo: `${window.location.origin}/confirm`
          }
        });

        if (authResult.error) throw authResult.error;

        if (authResult.data.user?.identities?.length === 0) {
          setError('An account with this email already exists. Please sign in instead.');
          return;
        }

        // Show success message
        alert('Check your email to confirm your account!');
        setMode('signin');
        setPassword('');
        return;
      } else {
        // Sign in
        authResult = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (authResult.error) throw authResult.error;
      }

      // Successfully authenticated - get/create user profile
      if (authResult.data.user && authResult.data.session) {
        const token = authResult.data.session.access_token;

        // Store auth token immediately
        localStorage.setItem('authToken', token);

        // Create or get user profile
        const response = await fetch('/api/auth/user-with-auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            email,
            firstName: firstName || authResult.data.user.user_metadata?.first_name,
            authUserId: authResult.data.user.id
          })
        });

        if (!response.ok) {
          throw new Error('Failed to create user profile');
        }

        const { user } = await response.json();
        setUserId(user.id);
        localStorage.setItem('userId', user.id);
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
                  <Input 
                    type="password" 
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-input border border-border"
                    required
                    minLength={6}
                  />
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