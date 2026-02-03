import { useState } from 'react';
import { useLocation } from 'wouter';
import Authentication from '@/components/authentication';
import vasaLogo from '@assets/iVASA Dark Purple_1762353221689.png';
import { ArrowLeft } from 'lucide-react';

export default function Login() {
  const [, setLocation] = useLocation();
  const [userId, setUserId] = useState<string | null>(null);

  // If user just signed in, redirect to dashboard
  if (userId) {
    setLocation('/');
    return null;
  }

  return (
    <div className="min-h-screen gradient-bg flex flex-col">
      {/* Top bar */}
      <div className="w-full flex justify-between items-center px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setLocation('/')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <img src={vasaLogo} alt="iVASA" className="h-8" />
        </div>
      </div>

      {/* Centered login form */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <Authentication
            setUserId={setUserId}
            formOnly={true}
            defaultMode="signin"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-6 px-4">
        <p className="text-xs text-muted-foreground">
          Built by a THERAPIST, with a TEAM of EXPERTS, for those SEEKING to become their own EXPERT.™
        </p>
      </div>
    </div>
  );
}
