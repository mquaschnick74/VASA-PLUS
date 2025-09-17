import { useState, useEffect } from 'react';
import Authentication from '@/components/authentication';
import VoiceInterface from '@/components/voice-interface';
import SetPasswordPrompt from '@/components/SetPasswordPrompt';
import { supabase } from '@/lib/supabaseClient';

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  useEffect(() => {
    // Check for existing user
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  useEffect(() => {
    const checkPasswordStatus = async () => {
      if (!userId) return;
      
      // Check if user has Supabase auth
      const authToken = localStorage.getItem('authToken');
      const passwordSet = localStorage.getItem('passwordSet');
      
      if (!authToken && !passwordSet) {
        // Legacy user without password
        // Get user email from your database
        try {
          const response = await fetch(`/api/auth/user/${userId}`);
          if (response.ok) {
            const data = await response.json();
            setUserEmail(data.user.email);
            setShowPasswordPrompt(true);
          }
        } catch (error) {
          console.error('Error checking user:', error);
        }
      }
    };

    checkPasswordStatus();
  }, [userId]);

  if (!userId) {
    return <Authentication setUserId={setUserId} />;
  }

  return (
    <div>
      {showPasswordPrompt && userEmail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <SetPasswordPrompt
              email={userEmail}
              onComplete={() => setShowPasswordPrompt(false)}
              onSkip={() => {
                setShowPasswordPrompt(false);
                localStorage.setItem('passwordPromptSkipped', 'true');
              }}
            />
          </div>
        </div>
      )}
      <VoiceInterface userId={userId} setUserId={setUserId} />
    </div>
  );
}
