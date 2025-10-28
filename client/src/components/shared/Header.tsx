// Location: client/src/components/shared/Header.tsx
// Shared navigation header component for all pages

import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { HelpCircle, BookOpen, DollarSign } from 'lucide-react';
import { handleLogout } from '@/lib/auth-helpers';
import vasaLogo from '@assets/iVASA Dark_1759424106928.png';

interface HeaderProps {
  userId?: string | null;
  setUserId?: (id: string | null) => void;
  userType?: string;
  showDashboardLink?: boolean;
}

export default function Header({ userId, setUserId, userType, showDashboardLink = false }: HeaderProps) {
  const [location] = useLocation();
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
          <Link href={isLoggedIn ? '/dashboard' : '/'}>
            <a className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
              <img
                src={vasaLogo}
                alt="iVASA"
                className="h-8 w-auto"
              />
            </a>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Dashboard Link (only show on blog/public pages when logged in) */}
            {isLoggedIn && showDashboardLink && (
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  className="text-sm hidden sm:inline-flex"
                >
                  Dashboard
                </Button>
              </Link>
            )}

            {/* Learn More (Blog) */}
            <Link href="/blog">
              <Button
                variant={location.startsWith('/blog') ? 'default' : 'ghost'}
                className="text-sm"
              >
                <BookOpen className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Learn More</span>
              </Button>
            </Link>

            {/* Pricing */}
            <Link href="/pricing">
              <Button
                variant={location === '/pricing' ? 'default' : 'ghost'}
                className="text-sm"
              >
                <DollarSign className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Pricing</span>
              </Button>
            </Link>

            {/* FAQ */}
            <Link href="/faq">
              <Button
                variant={location === '/faq' ? 'default' : 'ghost'}
                data-testid="button-faq"
                className="text-sm"
              >
                <HelpCircle className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">FAQ</span>
              </Button>
            </Link>

            {/* Auth Buttons */}
            {isLoggedIn ? (
              <Button
                onClick={handleSignOut}
                data-testid="button-signout"
                className="text-sm"
                disabled={loggingOut}
              >
                {loggingOut ? 'Signing Out...' : 'Sign Out'}
              </Button>
            ) : (
              <Link href="/">
                <Button
                  variant="default"
                  className="text-sm"
                >
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
