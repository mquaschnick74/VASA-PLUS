import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // With PKCE flow (Supabase JS v2 default), the ?code= param in the URL
    // is automatically exchanged for a session by the Supabase client singleton
    // at initialization time — before this component mounts.
    // We listen for PASSWORD_RECOVERY first, then fall back to getSession().

    let sessionConfirmed = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        sessionConfirmed = true;
        setIsValidSession(true);
        setError('');
        setCheckingSession(false);
      }
    });

    // Give the auth state change listener a tick to catch the event
    // if it fires synchronously during initialization, then fall back
    // to checking the stored session directly.
    const timer = setTimeout(async () => {
      if (sessionConfirmed) return;

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (session && !sessionError) {
          setIsValidSession(true);
        } else {
          setError('Recovery link has expired or is invalid. Please request a new password reset.');
        }
      } catch (err) {
        console.error('Error checking recovery session:', err);
        setError('An error occurred. Please try requesting a new password reset.');
      } finally {
        setCheckingSession(false);
      }
    }, 100);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      // On iOS, the PKCE exchange writes the session to localStorage but does
      // not always populate Supabase's internal in-memory currentSession.
      // updateUser() checks in-memory state and fails with "Auth session missing!"
      // Calling setSession() first forces the stored session into memory.
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (!session || sessionError) {
        setError('Your recovery session has expired. Please request a new password reset.');
        setLoading(false);
        return;
      }

      // Force the session into Supabase's in-memory state before calling updateUser
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (setSessionError) {
        console.error('Error restoring session:', setSessionError);
        setError('Your recovery session has expired. Please request a new password reset.');
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        console.error('Password update error:', updateError);
        setError(updateError.message);
        return;
      }

      toast({
        title: "Password Updated",
        description: "Your password has been successfully changed. Redirecting to dashboard...",
      });

      setTimeout(() => {
        setLocation('/dashboard');
      }, 2000);

    } catch (err) {
      console.error('Unexpected error updating password:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestNewReset = () => {
    setLocation('/login');
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-white/20 w-full max-w-md text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white/80">Verifying recovery link...</p>
        </div>
      </div>
    );
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-white/20 w-full max-w-md">
          <h1 className="text-2xl font-bold text-white mb-4 text-center">Password Reset</h1>
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
          <button
            onClick={handleRequestNewReset}
            className="w-full py-3 px-4 bg-primary hover:opacity-90 text-white font-semibold rounded-lg transition-colors"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-white/20 w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Set New Password</h1>
        <p className="text-white/60 text-center mb-6">Enter your new password below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white/80 mb-1">
              New Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
              minLength={8}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/80 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              required
              minLength={8}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="w-full py-3 px-4 bg-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Updating Password...
              </>
            ) : (
              'Update Password'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}