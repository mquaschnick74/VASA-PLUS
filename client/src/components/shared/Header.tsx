// Location: client/src/components/shared/Header.tsx
// Shared navigation header component for all pages

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { handleLogout } from '@/lib/auth-helpers';

interface HeaderProps {
  userId?: string | null;
  setUserId?: (id: string | null) => void;
  userType?: string;
  showDashboardLink?: boolean;
  hideSignInButton?: boolean;
}

export default function Header({ userId, setUserId, userType, showDashboardLink = false, hideSignInButton = false }: HeaderProps) {
  const [location, setLocation] = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const isLoggedIn = !!userId;

  const handleSignOut = async () => {
    if (setUserId && !loggingOut) {
      setLoggingOut(true);
      try {
        await handleLogout(setUserId);
      } catch (error) {
        console.error('Logout error:', error);
        setLoggingOut(false);
      }
    }
  };

  return (
    <nav className="sticky top-0 z-50 glass-strong border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div 
            onClick={() => setLocation(isLoggedIn ? '/dashboard' : '/')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <img
              src="/apple-touch-icon.png"
              alt="iVASA"
              className="h-10 w-10 object-contain rounded-lg"
            />
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Dashboard Link (only show on blog/public pages when logged in) */}
            {isLoggedIn && showDashboardLink && (
              <Button
                variant="ghost"
                className="text-sm hidden sm:inline-flex backdrop-filter backdrop-blur-md bg-transparent border border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all"
                onClick={() => setLocation('/dashboard')}
              >
                Dashboard
              </Button>
            )}

            {/* Assessment */}
            <Button
              variant="ghost"
              className={`text-sm backdrop-filter backdrop-blur-md bg-transparent border transition-all ${
                location === '/assessment'
                  ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(0,208,98,0.3)]'
                  : 'border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10'
              }`}
              onClick={() => setLocation('/assessment')}
            >
              Assessment
            </Button>

            {/* Learn More (Blog) */}
            <Button
              variant="ghost"
              className={`text-sm backdrop-filter backdrop-blur-md bg-transparent border transition-all ${
                location.startsWith('/blog')
                  ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(0,208,98,0.3)]'
                  : 'border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10'
              }`}
              onClick={() => setLocation('/blog')}
            >
              Learn More
            </Button>

            {/* Pricing */}
            <Button
              variant="ghost"
              className={`text-sm backdrop-filter backdrop-blur-md bg-transparent border transition-all ${
                location === '/pricing' || location === '/public-pricing'
                  ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(0,208,98,0.3)]'
                  : 'border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10'
              }`}
              onClick={() => setLocation(isLoggedIn ? "/pricing" : "/public-pricing")}
            >
              Pricing
            </Button>

            {/* FAQ */}
            <Button
              variant="ghost"
              data-testid="button-faq"
              className={`text-sm backdrop-filter backdrop-blur-md bg-transparent border transition-all ${
                location === '/faq'
                  ? 'border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(0,208,98,0.3)]'
                  : 'border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10'
              }`}
              onClick={() => setLocation('/faq')}
            >
              FAQ
            </Button>

            {/* Auth Buttons */}
            {isLoggedIn ? (
              <Button
                onClick={handleSignOut}
                data-testid="button-signout"
                variant="ghost"
                className="text-sm backdrop-filter backdrop-blur-md bg-transparent border border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:shadow-[0_0_15px_rgba(0,208,98,0.2)] transition-all duration-200"
                disabled={loggingOut}
              >
                {loggingOut ? 'Signing Out...' : 'Sign Out'}
              </Button>
            ) : !hideSignInButton && (
              <Button
                variant="ghost"
                className="text-sm backdrop-filter backdrop-blur-md bg-emerald-500/10 border border-emerald-500/40 hover:border-emerald-500/60 hover:bg-emerald-500/15 shadow-[0_0_15px_rgba(0,208,98,0.2)] transition-all"
                onClick={() => setLocation('/')}
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
