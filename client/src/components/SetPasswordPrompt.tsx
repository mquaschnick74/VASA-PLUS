// Location: client/src/components/SetPasswordPrompt.tsx

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';

interface SetPasswordPromptProps {
  email: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function SetPasswordPrompt({ email, onComplete, onSkip }: SetPasswordPromptProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create Supabase auth account for existing user
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`
        }
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('This email already has a password. Please sign in normally.');
        } else {
          throw signUpError;
        }
        return;
      }

      // Success - mark as complete
      localStorage.setItem('passwordSet', 'true');
      onComplete();
    } catch (error: any) {
      setError(error.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-strong border-0 mb-4">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <i className="fas fa-shield-alt text-accent"></i>
          Enhance Your Security
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Set a password to secure your account and enable new features.
        </p>

        <form onSubmit={handleSetPassword} className="space-y-3">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-red-500 text-xs">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">New Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Confirm Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="h-9 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="flex-1 h-9 text-sm bg-gradient-to-r from-primary to-accent"
            >
              {loading ? 'Setting...' : 'Set Password'}
            </Button>
            <Button
              type="button"
              onClick={onSkip}
              variant="ghost"
              className="h-9 text-sm"
            >
              Skip for now
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}