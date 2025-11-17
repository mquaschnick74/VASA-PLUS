// Location: client/src/pages/settings.tsx
// Unified settings page for all user types with role-aware sections

import { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import Header from '@/components/shared/Header';
import SettingsLayout from '@/components/settings/SettingsLayout';
import AccountSettings from '@/components/settings/AccountSettings';
import SubscriptionSettings from '@/components/settings/SubscriptionSettings';
import SupportSettings from '@/components/settings/SupportSettings';
import { supabase } from '@/lib/supabaseClient';

interface SettingsProps {
  userId: string;
  setUserId: (id: string | null) => void;
}

export default function Settings({ userId, setUserId }: SettingsProps) {
  const [, params] = useRoute('/settings/:section?');
  const [location, setLocation] = useLocation();
  const [userType, setUserType] = useState<string>('individual');
  const [loading, setLoading] = useState(true);

  // Get current section from URL or default to 'account'
  const currentSection = params?.section || 'account';

  // Fetch user type
  useEffect(() => {
    const fetchUserType = async () => {
      if (!userId) return;

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('user_type')
          .eq('user_id', userId)
          .single();

        if (error) throw error;

        setUserType(data?.user_type || 'individual');
      } catch (error) {
        console.error('Error fetching user type:', error);
        setUserType('individual');
      } finally {
        setLoading(false);
      }
    };

    fetchUserType();
  }, [userId]);

  // Define available sections based on user type
  const getSections = () => {
    const baseSections = [
      { id: 'account', label: 'Account', icon: 'User' },
      { id: 'support', label: 'Support & Help', icon: 'HelpCircle' },
    ];

    // Add subscription section for therapists, individuals, partners, influencers
    if (['therapist', 'individual', 'partner', 'influencer'].includes(userType)) {
      baseSections.splice(1, 0, {
        id: 'subscription',
        label: 'Subscription & Billing',
        icon: 'CreditCard'
      });
    }

    return baseSections;
  };

  const sections = getSections();

  // Handle section navigation
  const handleSectionChange = (sectionId: string) => {
    setLocation(`/settings/${sectionId}`);
  };

  // Render the appropriate section content
  const renderSection = () => {
    switch (currentSection) {
      case 'account':
        return <AccountSettings userId={userId} setUserId={setUserId} userType={userType} />;
      case 'subscription':
        return <SubscriptionSettings userId={userId} userType={userType} />;
      case 'support':
        return <SupportSettings userType={userType} />;
      default:
        return <AccountSettings userId={userId} setUserId={setUserId} userType={userType} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg">
        <Header userId={userId} setUserId={setUserId} userType={userType} />
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
      <Header userId={userId} setUserId={setUserId} userType={userType} />

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
