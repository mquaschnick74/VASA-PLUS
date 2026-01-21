import { useState } from 'react';
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

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleSignup = async () => {
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    else setError('Check your email to confirm your account');
    setLoading(false);
  };

  // Welcome screen
  if (mode === 'welcome') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-purple-900 to-black">
        {/* Logo */}
        <div className="mb-8">
          <img
            src="/apple-touch-icon.png"
            alt="iVASA"
            className="w-24 h-24 rounded-2xl shadow-lg"
          />
        </div>

        {/* App name */}
        <h1 className="text-3xl font-bold text-white mb-2">VASA-Plus</h1>
        <p className="text-purple-300 text-center mb-12 px-4">
          AI-powered therapeutic voice assistant
        </p>

        {/* Buttons */}
        <div className="w-full max-w-xs space-y-4">
          <Button
            onClick={() => setMode('login')}
            className="w-full py-6 text-lg bg-emerald-500 hover:bg-emerald-600"
          >
            Log In
          </Button>
          <Button
            onClick={() => setMode('signup')}
            variant="outline"
            className="w-full py-6 text-lg border-purple-400 text-purple-300 hover:bg-purple-900"
          >
            Sign Up
          </Button>
        </div>

        {/* Footer */}
        <p className="absolute bottom-8 text-xs text-purple-400 text-center px-4">
          Built by a therapist, for those seeking to become their own expert.
        </p>
      </div>
    );
  }

  // Login or Signup form
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-purple-900 to-black">
      {/* Back button */}
      <button
        onClick={() => setMode('welcome')}
        className="absolute top-12 left-6 text-purple-300 text-lg"
      >
        Back
      </button>

      <h2 className="text-2xl font-bold text-white mb-8">
        {mode === 'login' ? 'Welcome Back' : 'Create Account'}
      </h2>

      <div className="w-full max-w-xs space-y-4">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="py-6 bg-purple-900/50 border-purple-500 text-white placeholder:text-purple-400"
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="py-6 bg-purple-900/50 border-purple-500 text-white placeholder:text-purple-400"
        />

        {error && (
          <p className={`text-sm text-center ${error.includes('Check your email') ? 'text-emerald-400' : 'text-red-400'}`}>
            {error}
          </p>
        )}

        <Button
          onClick={mode === 'login' ? handleLogin : handleSignup}
          disabled={loading}
          className="w-full py-6 text-lg bg-emerald-500 hover:bg-emerald-600"
        >
          {loading ? 'Please wait...' : (mode === 'login' ? 'Log In' : 'Sign Up')}
        </Button>

        {mode === 'login' && (
          <button
            onClick={() => setMode('signup')}
            className="w-full text-purple-300 text-sm"
          >
            Don't have an account? Sign up
          </button>
        )}
        {mode === 'signup' && (
          <button
            onClick={() => setMode('login')}
            className="w-full text-purple-300 text-sm"
          >
            Already have an account? Log in
          </button>
        )}
      </div>
    </div>
  );
}
