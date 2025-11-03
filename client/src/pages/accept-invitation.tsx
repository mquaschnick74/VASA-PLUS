// client/src/pages/accept-invitation.tsx
// Complete implementation for accepting therapist invitations

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabaseClient';
import vasaLogo from '@assets/VASA Favi Minimal_1758122988999.png';

interface InvitationDetails {
  therapist_id: string;
  therapist_email: string;
  therapist_name: string;
  client_email: string;
  expires_at: string;
}

export default function AcceptInvitation() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'signup' | 'accepting' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Signup form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);

  useEffect(() => {
    checkInvitation();
  }, []);

  const checkInvitation = async () => {
    const params = new URLSearchParams(window.location.search);
    const invitationToken = params.get('token');
    const therapistId = params.get('therapist');

    if (!invitationToken) {
      setStatus('error');
      setMessage('Invalid invitation link. Please check the link and try again.');
      return;
    }

    setToken(invitationToken);

    try {
      // First check if user is already signed in
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // User is signed in, try to accept invitation
        await acceptInvitation(invitationToken, session.access_token);
      } else {
        // User needs to sign up or sign in first
        // Try to get invitation details for display
        const response = await fetch(`/api/therapist/invitation-details?token=${invitationToken}`);

        if (response.ok) {
          const invitationData = await response.json();
          setInvitation(invitationData);
          setEmail(invitationData.client_email);
        }

        setStatus('signup');
      }
    } catch (error) {
      console.error('Error checking invitation:', error);
      setStatus('error');
      setMessage('An error occurred while processing your invitation.');
    }
  };

  const acceptInvitation = async (invitationToken: string, authToken: string) => {
    setStatus('accepting');
    setMessage('Accepting invitation...');

    try {
      const response = await fetch('/api/therapist/accept-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          token: invitationToken
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setStatus('success');
        setMessage('Invitation accepted successfully! Redirecting to your dashboard...');

        // Clear any stored invitation data
        localStorage.removeItem('invitationToken');
        localStorage.removeItem('therapistId');

        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 2000);
      } else {
        setStatus('error');
        setMessage(result.error || 'Failed to accept invitation. Please try again.');
      }
    } catch (error) {
      console.error('Error accepting invitation:', error);
      setStatus('error');
      setMessage('An error occurred while accepting the invitation.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !firstName) return;

    setSignupLoading(true);
    setSignupError(null);

    try {
      // Create the account
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { 
            first_name: firstName,
            user_type: 'client',
            invitation_token: token
          },
          emailRedirectTo: window.location.href // Return to this page after email confirmation
        }
      });

      if (signUpError) throw signUpError;

      if (authData.user?.identities?.length === 0) {
        setSignupError('An account with this email already exists. Please sign in instead.');
        return;
      }

      // Show verification message
      setStatus('success');
      setMessage(`
        Account created! Please check your email (${email}) to verify your account. 
        After verification, return here to accept the invitation.
      `);

      // Store token for after verification
      if (token) {
        localStorage.setItem('pendingInvitationToken', token);
      }

    } catch (error: any) {
      console.error('Signup error:', error);
      setSignupError(error.message || 'Failed to create account. Please try again.');
    } finally {
      setSignupLoading(false);
    }
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setSignupLoading(true);
    setSignupError(null);

    try {
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) throw signInError;

      if (!authData.user?.email_confirmed_at) {
        setSignupError('Please verify your email before signing in.');
        await supabase.auth.signOut();
        return;
      }

      // Successfully signed in, now accept the invitation
      if (token && authData.session) {
        await acceptInvitation(token, authData.session.access_token);
      }

    } catch (error: any) {
      console.error('Signin error:', error);
      setSignupError(error.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setSignupLoading(false);
    }
  };

  // Check for pending invitation after email verification
  useEffect(() => {
    const checkPendingInvitation = async () => {
      const pendingToken = localStorage.getItem('pendingInvitationToken');
      if (pendingToken && status === 'loading') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await acceptInvitation(pendingToken, session.access_token);
          localStorage.removeItem('pendingInvitationToken');
        }
      }
    };

    checkPendingInvitation();
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Checking invitation...</p>
        </div>
      </div>
    );
  }

  if (status === 'accepting') {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg">{message}</p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <Card className="w-full max-w-md glass">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-check text-2xl text-green-500"></i>
            </div>
            <h2 className="text-2xl font-bold mb-4">Success!</h2>
            <p className="text-muted-foreground">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <Card className="w-full max-w-md glass">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-exclamation-triangle text-2xl text-red-500"></i>
            </div>
            <h2 className="text-2xl font-bold mb-4">Invitation Error</h2>
            <p className="text-muted-foreground mb-6">{message}</p>
            <Button onClick={() => setLocation('/dashboard')} variant="outline">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'signup') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 gradient-bg">
        <div className="w-full max-w-2xl">
          {/* Logo and Branding */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-16 h-16">
                <img src={vasaLogo} alt="iVASA Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                iVASA
              </h1>
            </div>
            <p className="text-muted-foreground text-lg">Accept Your Therapist's Invitation</p>
          </div>

          <Card className="glass rounded-2xl border-0">
            <CardHeader>
              <CardTitle>
                {invitation ? 
                  `${invitation.therapist_name} has invited you to iVASA` : 
                  'Create Your Account'
                }
              </CardTitle>
            </CardHeader>
            <CardContent>
              {signupError && (
                <Alert className="mb-4 bg-red-500/10 border-red-500/20">
                  <AlertDescription className="text-red-500">
                    {signupError}
                  </AlertDescription>
                </Alert>
              )}

              <div className="mb-6 p-4 bg-blue-500/10 rounded-lg">
                <p className="text-sm">
                  By accepting this invitation, you'll be able to:
                </p>
                <ul className="text-sm mt-2 space-y-1 ml-4">
                  <li>• Access AI-powered therapeutic sessions</li>
                  <li>• Use your therapist's subscription</li>
                  <li>• Track your mental health progress</li>
                </ul>
              </div>

              {/* Tabs for Sign Up / Sign In */}
              <div className="flex gap-2 mb-6">
                <Button
                  variant={!signupError?.includes('already exists') ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSignupError(null)}
                >
                  Create Account
                </Button>
                <Button
                  variant={signupError?.includes('already exists') ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSignupError('Please sign in with your existing account')}
                >
                  Sign In
                </Button>
              </div>

              {/* Form */}
              <form onSubmit={signupError?.includes('already exists') ? handleSignin : handleSignup} className="space-y-4">
                {!signupError?.includes('already exists') && (
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Enter your first name"
                      required
                      className="w-full"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full"
                    disabled={!!invitation?.client_email}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a secure password"
                    required
                    className="w-full"
                    minLength={6}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={signupLoading}
                  className="w-full bg-gradient-to-r from-primary to-accent"
                >
                  {signupLoading ? 'Processing...' : 
                   signupError?.includes('already exists') ? 'Sign In & Accept' : 'Create Account & Accept'}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Having trouble? Contact your therapist for help.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return null;
}