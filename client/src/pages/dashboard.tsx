import { useState, useEffect } from 'react';
import Authentication from '@/components/authentication';
import VoiceInterface from '@/components/voice-interface';

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing user
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  if (!userId) {
    return <Authentication setUserId={setUserId} />;
  }

  return <VoiceInterface userId={userId} setUserId={setUserId} />;
}
