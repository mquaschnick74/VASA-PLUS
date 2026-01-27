import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabaseClient';

interface NativeAuthScreenProps {
  setUserId: (id: string | null) => void;
}

export function NativeAuthScreen({ setUserId }: NativeAuthScreenProps) {
  const [mode, setMode] = useState<'welcome' | 'login' | 'signup'>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Auth successful - the parent component should detect this and show dashboard
        console.log('User signed in successfully');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (authError) {
        console.error('Login error:', authError);
        if (authError.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please try again.');
        } else if (authError.message.includes('Email not confirmed')) {
          setError('Please check your email and confirm your account first.');
        } else {
          setError(authError.message);
        }
      } else if (data?.user) {
        console.log('Login successful:', data.user.email);
        // Auth state change listener will handle navigation
      }
    } catch (err) {
      console.error('Login exception:', err);
      setError('An unexpected error occurred. Please try again.');
    }

    setLoading(false);
  };

  const handleSignup = async () => {
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password
      });

      if (authError) {
        console.error('Signup error:', authError);
        setError(authError.message);
      } else if (data?.user) {
        // Check if user already exists (Supabase returns user with identities = [] for existing email)
        if (data.user.identities && data.user.identities.length === 0) {
          setError('An account with this email already exists. Please log in instead.');
        } else {
          setMessage('Check your email to confirm your account, then come back to log in.');
        }
      }
    } catch (err) {
      console.error('Signup exception:', err);
      setError('An unexpected error occurred. Please try again.');
    }

    setLoading(false);
  };

  // Welcome screen
  if (mode === 'welcome') {
    return (
        <div
          className="h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-purple-900 via-purple-800 to-black overflow-hidden fixed inset-0"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
        {/* Logo */}
        <div className="mb-8">
          <img
            src="/apple-touch-icon.png"
            alt="iVASA"
            className="w-24 h-24 rounded-2xl shadow-lg"
          />
        </div>

        {/* App name */}
        <h1 className="text-4xl font-bold text-white mb-2">iVASA</h1>
        <p className="text-purple-300 text-center mb-12 px-4 text-lg">
          AI-powered therapeutic voice assistant
        </p>

        {/* Buttons */}
        <div className="w-full max-w-xs space-y-4">
          <Button
            onClick={() => setMode('login')}
            className="w-full py-6 text-lg bg-emerald-500 hover:bg-emerald-600 rounded-xl"
          >
            Log In
          </Button>
          <Button
            onClick={() => setMode('signup')}
            className="w-full py-6 text-lg bg-emerald-700 hover:bg-emerald-800 rounded-xl"
          >
            Sign Up
          </Button>
        </div>

        {/* Footer */}
        <p
          className="absolute bottom-8 text-xs text-purple-400 text-center px-4"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          Built by a therapist, for those seeking to become their own expert.
        </p>
      </div>
    );
  }

  // Login or Signup form
  return (
    <div
      className="min-h-screen flex flex-col bg-gradient-to-b from-purple-900 via-purple-800 to-black"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Back button - positioned at top */}
      <div className="p-6">
        <button
          onClick={() => {
            // Switch between login and signup instead of going to welcome
            setMode(mode === 'login' ? 'signup' : 'login');
            setError('');
            setMessage('');
            setEmail('');
            setPassword('');
          }}
          className="text-purple-300 text-lg flex items-center gap-2 py-2 px-4 -ml-4 min-h-[44px]"
        >
          ← Back
        </button>
      </div>

      {/* Form - centered vertically in remaining space */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-32">
        <h2 className="text-3xl font-bold text-white mb-8">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h2>

        <div className="w-full max-w-xs space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            className="py-6 bg-purple-900/50 border-purple-500 text-white placeholder:text-purple-400 rounded-xl"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="py-6 bg-purple-900/50 border-purple-500 text-white placeholder:text-purple-400 rounded-xl"
          />

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-900/30 p-3 rounded-lg">{error}</p>
          )}

          {message && (
            <p className="text-emerald-400 text-sm text-center bg-emerald-900/30 p-3 rounded-lg">{message}</p>
          )}

          <Button
            onClick={mode === 'login' ? handleLogin : handleSignup}
            disabled={loading}
            className="w-full py-6 text-lg bg-emerald-500 hover:bg-emerald-600 rounded-xl mt-4"
          >
            {loading ? 'Please wait...' : (mode === 'login' ? 'Log In' : 'Sign Up')}
          </Button>

          <div className="pt-4">
            {mode === 'login' && (
              <button
                onClick={() => {
                  setMode('signup');
                  setError('');
                  setMessage('');
                }}
                className="w-full text-purple-300 text-sm"
              >
                Don't have an account? <span className="text-emerald-400">Sign up</span>
              </button>
            )}
            {mode === 'signup' && (
              <button
                onClick={() => {
                  setMode('login');
                  setError('');
                  setMessage('');
                }}
                className="w-full text-purple-300 text-sm"
              >
                Already have an account? <span className="text-emerald-400">Log in</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
