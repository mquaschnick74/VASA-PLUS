// Location: client/src/pages/reset-password.tsx

import { useState, useEffect } from 'react';
import { useNavigate } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';

export default function ResetPassword() {
  const [, navigate] = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if we have a reset token
    const resetToken = localStorage.getItem('resetToken');
    if (!resetToken) {
      navigate('/');
    }
  }, [navigate]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const resetToken = localStorage.getItem('resetToken');

      if (!resetToken) {
        throw new Error('No reset token found');
      }

      // Update the password using the session from the reset token
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) throw updateError;

      // Clear the reset token
      localStorage.removeItem('resetToken');

      // Success - redirect to dashboard
      alert('Password updated successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      setError(error.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-bg">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Set New Password</h1>
          <p className="text-muted-foreground">
            Choose a strong password for your account
          </p>
        </div>

        <Card className="glass rounded-2xl border-0">
          <CardContent className="p-8">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-500 text-sm mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl bg-input border border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 6 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-xl bg-input border border-border"
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="w-full bg-gradient-to-r from-primary to-accent py-3 rounded-xl"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>

            <button
              onClick={() => navigate('/')}
              className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}