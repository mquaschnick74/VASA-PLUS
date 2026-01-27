// Location: client/src/pages/settings.tsx
// Unified settings page for all user types with role-aware sections

import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import Header from '@/components/shared/Header';
import SettingsLayout from '@/components/settings/SettingsLayout';
import AccountSettings from '@/components/settings/AccountSettings';
import SupportSettings from '@/components/settings/SupportSettings';
import EmailPreferencesSettings from '@/components/settings/EmailPreferencesSettings';
import PushNotificationSettings from '@/components/settings/PushNotificationSettings';
import { supabase } from '@/lib/supabaseClient';

export default function Settings() {
  const [, params] = useRoute('/settings/:section?');
  const [location, setLocation] = useLocation();
  const [userId, setUserId] = useState<string | null>(null);
  const [userType, setUserType] = useState<string>('individual');
  const [loading, setLoading] = useState(true);

  // Get current section from URL or default to 'account'
  const currentSection = params?.section || 'account';

  // Check authentication and fetch user data
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setLocation('/');
          return;
        }

        if (!session) {
          console.log('No session found, redirecting to login');
          setLocation('/');
          return;
        }

        const currentUserId = session.user.id;

        // Fetch user's internal ID and type from user_profiles
        // Note: session.user.id is the auth_user_id, we need the internal user ID
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', currentUserId)
          .single();

        if (userError || !userData) {
          console.error('Error fetching user:', userError);
          setLocation('/');
          return;
        }

        setUserId(userData.id);

        // Fetch user type using the internal user ID
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('user_type')
          .eq('id', userData.id)
          .single();

        if (profileError) {
          console.error('Error fetching user profile:', profileError);
          setUserType('individual');
        } else {
          setUserType(profileData?.user_type || 'individual');
        }
      } catch (error) {
        console.error('Error initializing settings:', error);
        setLocation('/');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, [setLocation]);

  // Define available sections based on user type
  // Note: Subscription management is now handled via Stripe Portal from the dashboard
  const getSections = () => {
    const baseSections = [
      { id: 'account', label: 'Account', icon: 'User' },
      { id: 'push-notifications', label: 'Push Notifications', icon: 'Bell' },
      { id: 'email-preferences', label: 'Email Preferences', icon: 'Mail' },
      { id: 'support', label: 'Support & Help', icon: 'HelpCircle' },
    ];

    return baseSections;
  };

  const sections = getSections();

  // Handle section navigation
  const handleSectionChange = (sectionId: string) => {
    setLocation(`/settings/${sectionId}`);
  };

  // Render the appropriate section content
  const renderSection = () => {
    if (!userId) return null;

    switch (currentSection) {
      case 'account':
        return <AccountSettings userId={userId} setUserId={setUserId} userType={userType} />;
      case 'push-notifications':
        return <PushNotificationSettings userId={userId} userType={userType} />;
      case 'email-preferences':
        return <EmailPreferencesSettings userId={userId} userType={userType} />;
      case 'support':
        return <SupportSettings userType={userType} />;
      default:
        return <AccountSettings userId={userId} setUserId={setUserId} userType={userType} />;
    }
  };

  if (loading || !userId) {
    return (
      <div className="min-h-screen gradient-bg">
        <Header userId={userId} setUserId={setUserId} userType={userType} showDashboardLink={true} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading settings...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Header userId={userId} setUserId={setUserId} userType={userType} showDashboardLink={true} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <button
            onClick={() => setLocation('/dashboard')}
            className="text-sm text-emerald-500 hover:text-emerald-400 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your account, preferences, and settings
          </p>
        </div>

        {/* Settings Layout with Sidebar */}
        <SettingsLayout
          sections={sections}
          currentSection={currentSection}
          onSectionChange={handleSectionChange}
        >
          {renderSection()}
        </SettingsLayout>
      </div>
    </div>
  );
}
