// Location: client/src/components/settings/PushNotificationSettings.tsx
// Push notification settings section for managing notification preferences

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Bell, BellRing, Clock, Save, AlertCircle, Smartphone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  isPushNotificationsSupported,
  checkPushNotificationPermission,
  enablePushNotifications,
  registerDeviceToken,
  unregisterDeviceToken,
  getCurrentToken,
  fetchPushNotificationPreferences,
  updatePushNotificationPreferences,
  type PushNotificationPreferences
} from '@/lib/push-notifications';
import { isNativeApp } from '@/lib/platform';

interface PushNotificationSettingsProps {
  userId: string;
  userType: string;
}

const DEFAULT_PREFERENCES: PushNotificationPreferences = {
  push_notifications_enabled: true,
  session_reminders_enabled: true,
  therapeutic_followups_enabled: true,
  announcements_enabled: true,
  reminder_minutes_before: 30,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00'
};

const REMINDER_OPTIONS = [
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
  { value: '1440', label: '1 day before' }
];

export default function PushNotificationSettings({ userId }: PushNotificationSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Permission state
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unsupported'>('prompt');
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);

  // Preferences state
  const [preferences, setPreferences] = useState<PushNotificationPreferences>(DEFAULT_PREFERENCES);

  // Check if push notifications are supported
  const isSupported = isPushNotificationsSupported();

  // Load preferences and check permission status
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);

        // Check if supported
        if (!isSupported) {
          setPermissionStatus('unsupported');
          setLoading(false);
          return;
        }

        // Check permission status
        const status = await checkPushNotificationPermission();
        setPermissionStatus(status);

        // Load preferences from backend
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;

        if (token) {
          const prefs = await fetchPushNotificationPreferences(userId, token);
          if (prefs) {
            setPreferences(prefs);
          }
        }
      } catch (error) {
        console.error('Error initializing push notification settings:', error);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [userId, isSupported]);

  // Handle enabling push notifications (request permission)
  const handleEnableNotifications = useCallback(async () => {
    setIsEnablingNotifications(true);
    setSaveError(null);

    try {
      const enabled = await enablePushNotifications();

      if (enabled) {
        setPermissionStatus('granted');

        // Register token with backend
        const session = await supabase.auth.getSession();
        const authToken = session.data.session?.access_token;
        const deviceToken = getCurrentToken();

        if (authToken && deviceToken) {
          await registerDeviceToken(deviceToken, authToken);
        }
      } else {
        setPermissionStatus('denied');
        setSaveError('Push notification permission was denied. You can enable it in your device settings.');
      }
    } catch (error) {
      console.error('Error enabling push notifications:', error);
      setSaveError('Failed to enable push notifications. Please try again.');
    } finally {
      setIsEnablingNotifications(false);
    }
  }, []);

  // Handle toggling master push notification switch
  const handleMasterToggle = useCallback(async (enabled: boolean) => {
    setPreferences(prev => ({ ...prev, push_notifications_enabled: enabled }));

    if (!enabled) {
      // When disabling, unregister the token
      const session = await supabase.auth.getSession();
      const authToken = session.data.session?.access_token;
      if (authToken) {
        await unregisterDeviceToken(authToken);
      }
    } else if (permissionStatus === 'granted') {
      // When enabling and permission is granted, register token
      const session = await supabase.auth.getSession();
      const authToken = session.data.session?.access_token;
      const deviceToken = getCurrentToken();
      if (authToken && deviceToken) {
        await registerDeviceToken(deviceToken, authToken);
      }
    }
  }, [permissionStatus]);

  // Save preferences to backend
  const savePreferences = useCallback(async () => {
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

      const updatedPrefs = await updatePushNotificationPreferences(userId, preferences, token);

      if (updatedPrefs) {
        setPreferences(updatedPrefs);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError('Failed to save preferences. Please try again.');
      }
    } catch (error) {
      console.error('Error saving push preferences:', error);
      setSaveError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }, [userId, preferences]);

  // Loading state
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

  // Web-only message (push notifications only work on native app)
  if (!isNativeApp) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Push Notifications</h2>
          <p className="text-muted-foreground text-sm">
            Manage push notifications for session reminders and updates
          </p>
        </div>

        <Card className="glass border-white/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-emerald-500" />
              <CardTitle>iOS App Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Alert className="bg-blue-500/10 border-blue-500/30">
              <AlertCircle className="h-4 w-4 text-blue-400" />
              <AlertDescription className="text-blue-400">
                Push notifications are only available in the iVASA iOS app. Download the app from the App Store to receive session reminders and therapeutic follow-up notifications.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Permission not granted - show enable button
  if (permissionStatus !== 'granted') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Push Notifications</h2>
          <p className="text-muted-foreground text-sm">
            Enable push notifications to receive session reminders and therapeutic follow-ups
          </p>
        </div>

        <Card className="glass border-white/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-emerald-500" />
              <CardTitle>Enable Notifications</CardTitle>
            </div>
            <CardDescription>
              Get timely reminders for your therapeutic sessions and personalized follow-up notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {saveError && (
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">
                  {saveError}
                </AlertDescription>
              </Alert>
            )}

            <div className="text-sm text-muted-foreground space-y-2">
              <p>With push notifications enabled, you'll receive:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Session reminders before scheduled sessions</li>
                <li>Therapeutic follow-ups after your sessions</li>
                <li>Important announcements and updates</li>
              </ul>
            </div>

            <Button
              onClick={handleEnableNotifications}
              disabled={isEnablingNotifications}
              className="w-full"
            >
              <BellRing className="mr-2 h-4 w-4" />
              {isEnablingNotifications ? 'Enabling...' : 'Enable Push Notifications'}
            </Button>

            {permissionStatus === 'denied' && (
              <p className="text-xs text-muted-foreground text-center">
                You previously denied push notification permission. To enable notifications, go to Settings {'>'} iVASA {'>'} Notifications on your device.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Full settings UI (permission granted)
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Push Notifications</h2>
        <p className="text-muted-foreground text-sm">
          Manage your push notification preferences and settings
        </p>
      </div>

      {/* Success/Error Messages */}
      {saveSuccess && (
        <Alert className="bg-emerald-500/10 border-emerald-500/30">
          <AlertDescription className="text-emerald-400">
            Preferences saved successfully
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

      {/* Master Toggle Card */}
      <Card className="glass border-white/10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-emerald-500" />
            <CardTitle>Push Notifications</CardTitle>
          </div>
          <CardDescription>
            Control all push notifications from iVASA
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="push-enabled">Enable Push Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications on your device
              </p>
            </div>
            <Switch
              id="push-enabled"
              checked={preferences.push_notifications_enabled}
              onCheckedChange={handleMasterToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification Types Card */}
      {preferences.push_notifications_enabled && (
        <Card className="glass border-white/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-emerald-500" />
              <CardTitle>Notification Types</CardTitle>
            </div>
            <CardDescription>
              Choose which types of notifications you want to receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Session Reminders */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="session-reminders">Session Reminders</Label>
                <p className="text-sm text-muted-foreground">
                  Get reminded before your scheduled therapy sessions
                </p>
              </div>
              <Switch
                id="session-reminders"
                checked={preferences.session_reminders_enabled}
                onCheckedChange={(checked) =>
                  setPreferences(prev => ({ ...prev, session_reminders_enabled: checked }))
                }
              />
            </div>

            {/* Reminder timing selector */}
            {preferences.session_reminders_enabled && (
              <div className="ml-4 pl-4 border-l border-white/10 space-y-2">
                <Label htmlFor="reminder-timing">Reminder Timing</Label>
                <Select
                  value={String(preferences.reminder_minutes_before)}
                  onValueChange={(value) =>
                    setPreferences(prev => ({ ...prev, reminder_minutes_before: parseInt(value) }))
                  }
                >
                  <SelectTrigger id="reminder-timing" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Therapeutic Follow-ups */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="therapeutic-followups">Therapeutic Follow-ups</Label>
                <p className="text-sm text-muted-foreground">
                  Receive thoughtful check-ins after your therapy sessions
                </p>
              </div>
              <Switch
                id="therapeutic-followups"
                checked={preferences.therapeutic_followups_enabled}
                onCheckedChange={(checked) =>
                  setPreferences(prev => ({ ...prev, therapeutic_followups_enabled: checked }))
                }
              />
            </div>

            {/* Announcements */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="announcements">Announcements</Label>
                <p className="text-sm text-muted-foreground">
                  Stay updated with new features and important updates
                </p>
              </div>
              <Switch
                id="announcements"
                checked={preferences.announcements_enabled}
                onCheckedChange={(checked) =>
                  setPreferences(prev => ({ ...prev, announcements_enabled: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quiet Hours Card */}
      {preferences.push_notifications_enabled && (
        <Card className="glass border-white/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-500" />
              <CardTitle>Quiet Hours</CardTitle>
            </div>
            <CardDescription>
              Set times when you don't want to receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="quiet-hours">Enable Quiet Hours</Label>
                <p className="text-sm text-muted-foreground">
                  Pause notifications during specific hours
                </p>
              </div>
              <Switch
                id="quiet-hours"
                checked={preferences.quiet_hours_enabled}
                onCheckedChange={(checked) =>
                  setPreferences(prev => ({ ...prev, quiet_hours_enabled: checked }))
                }
              />
            </div>

            {preferences.quiet_hours_enabled && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="quiet-start">Start Time</Label>
                  <input
                    type="time"
                    id="quiet-start"
                    value={preferences.quiet_hours_start}
                    onChange={(e) =>
                      setPreferences(prev => ({ ...prev, quiet_hours_start: e.target.value }))
                    }
                    className="flex h-10 w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiet-end">End Time</Label>
                  <input
                    type="time"
                    id="quiet-end"
                    value={preferences.quiet_hours_end}
                    onChange={(e) =>
                      setPreferences(prev => ({ ...prev, quiet_hours_end: e.target.value }))
                    }
                    className="flex h-10 w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
    </div>
  );
}
