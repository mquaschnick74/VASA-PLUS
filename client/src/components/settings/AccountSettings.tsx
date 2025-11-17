// Location: client/src/components/settings/AccountSettings.tsx
// Account settings section with profile info and account management

import { useState, useEffect } from 'react';
import { DeleteAccount } from '../DeleteAccount';
import { supabase } from '@/lib/supabaseClient';
import { User, Mail, Calendar, Shield } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AccountSettingsProps {
  userId: string;
  setUserId: (id: string | null) => void;
  userType: string;
}

interface UserProfile {
  email?: string;
  first_name?: string;
  last_name?: string;
  created_at?: string;
  user_type?: string;
}

export default function AccountSettings({ userId, setUserId, userType }: AccountSettingsProps) {
  const [profile, setProfile] = useState<UserProfile>({});
  const [sessionCount, setSessionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!userId) return;

      try {
        // Get email from auth session
        const { data: { session } } = await supabase.auth.getSession();
        const userEmail = session?.user?.email;

        // Fetch user profile (using 'id' not 'user_id')
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          // Still try to set email from auth if profile fetch fails
          setProfile({ email: userEmail });
        } else {
          // Merge profile data with email from auth (most reliable source)
          setProfile({
            ...profileData,
            email: profileData?.email || userEmail
          });
        }

        // Fetch session count
        const { count, error: countError } = await supabase
          .from('sessions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (countError) {
          console.error('Error fetching session count:', countError);
        }

        setSessionCount(count || 0);
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [userId]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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
        <h2 className="text-2xl font-bold mb-2">Account Settings</h2>
        <p className="text-muted-foreground text-sm">
          Manage your account information and preferences
        </p>
      </div>

      {/* Profile Information Card */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-emerald-500" />
            Profile Information
          </CardTitle>
          <CardDescription>
            Your account details and profile information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                First Name
              </label>
              <p className="text-base font-medium">
                {profile.first_name || 'Not set'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Last Name
              </label>
              <p className="text-base font-medium">
                {profile.last_name || 'Not set'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address
              </label>
              <p className="text-base font-medium">
                {profile.email || 'Not set'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Account Type
              </label>
              <p className="text-base font-medium capitalize">
                {userType}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Member Since
              </label>
              <p className="text-base font-medium">
                {formatDate(profile.created_at)}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Total Sessions
              </label>
              <p className="text-base font-medium">
                {sessionCount}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Management Card */}
      <Card className="glass border-white/10 border-red-500/20">
        <CardHeader>
          <CardTitle className="text-red-400">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible account actions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-red-500/10 border-red-500/30">
            <AlertDescription className="text-sm">
              Deleting your account is permanent and cannot be undone. All your data, including {sessionCount} session(s), will be permanently deleted.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="font-medium text-sm">Delete Account</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete your account and all associated data
              </p>
            </div>
            <DeleteAccount
              userId={userId}
              userEmail={profile.email}
              sessionCount={sessionCount}
              onAccountDeleted={() => setUserId(null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Future: Add password change section */}
      {/* Future: Add email change section */}
      {/* Future: Add notification preferences */}
    </div>
  );
}
