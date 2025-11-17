// Location: client/src/components/settings/EmailPreferencesSettings.tsx
// Email preferences settings section for weekly therapeutic recap emails

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Mail, Save } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface EmailPreferencesSettingsProps {
  userId: string;
  userType: string;
}

export default function EmailPreferencesSettings({ userId }: EmailPreferencesSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weeklyRecapEnabled, setWeeklyRecapEnabled] = useState(true);
  const [preferredVoice, setPreferredVoice] = useState<'sarah' | 'mathew'>('sarah');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    loadPreferences();
  }, [userId]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        console.error('No auth token found');
        return;
      }

      const response = await fetch(`/api/email-preferences/${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setWeeklyRecapEnabled(data.preferences.weekly_recap_enabled ?? true);
        setPreferredVoice(data.preferences.preferred_meditation_voice ?? 'sarah');
      } else {
        console.error('Failed to load email preferences');
      }
    } catch (error) {
      console.error('Error loading email preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      setSaveError(null);

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        setSaveError('Authentication required');
        return;
      }

      const response = await fetch(`/api/email-preferences/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          weekly_recap_enabled: weeklyRecapEnabled,
          preferred_meditation_voice: preferredVoice
        })
      });

      if (response.ok) {
        setSaveSuccess(true);
        // Clear success message after 3 seconds
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const errorData = await response.json();
        setSaveError(errorData.error || 'Failed to save preferences');
      }
    } catch (error) {
      console.error('Error saving preferences:', error);
      setSaveError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-white/10 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-white/10 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Email Preferences</h2>
        <p className="text-muted-foreground text-sm">
          Manage your weekly therapeutic recap emails and preferences
        </p>
      </div>

      {/* Email Preferences Card */}
      <Card className="glass border-white/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-emerald-500" />
            <CardTitle>Weekly Therapeutic Recaps</CardTitle>
          </div>
          <CardDescription>
            Personalized summaries of your therapeutic journey delivered to your inbox
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Success/Error Messages */}
          {saveSuccess && (
            <Alert className="bg-emerald-500/10 border-emerald-500/30">
              <AlertDescription className="text-emerald-400">
                ✓ Preferences saved successfully
              </AlertDescription>
            </Alert>
          )}

          {saveError && (
            <Alert className="bg-red-500/10 border-red-500/30">
              <AlertDescription className="text-red-400">
                {saveError}
              </AlertDescription>
            </Alert>
          )}

          {/* Weekly Recap Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="weekly-recap">Weekly Therapeutic Recaps</Label>
              <p className="text-sm text-muted-foreground">
                Receive a personalized summary of your therapeutic journey every week
              </p>
            </div>
            <Switch
              id="weekly-recap"
              checked={weeklyRecapEnabled}
              onCheckedChange={setWeeklyRecapEnabled}
            />
          </div>

          {/* Meditation Voice Preference */}
          {weeklyRecapEnabled && (
            <div className="space-y-2">
              <Label htmlFor="meditation-voice">Meditation Voice</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Choose which therapeutic agent's voice you prefer for guided meditations
              </p>
              <Select value={preferredVoice} onValueChange={(value: 'sarah' | 'mathew') => setPreferredVoice(value)}>
                <SelectTrigger id="meditation-voice">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sarah">Sarah (Emotional Support)</SelectItem>
                  <SelectItem value="mathew">Mathew (Analytical Exploration)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Save Button */}
          <Button
            onClick={savePreferences}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>

          {/* Info Text */}
          <div className="text-xs text-muted-foreground pt-2 border-t border-white/10">
            <p>📧 Recaps are sent 3 days after your last session, or after 7 days of inactivity</p>
            <p className="mt-1">🧘 Each recap includes a 4-10 minute guided meditation (campfire, ocean, or singing bowl)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
