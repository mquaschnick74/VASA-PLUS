// Location: client/src/components/shared/Header.tsx
// Shared navigation header component for all pages

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { handleLogout } from '@/lib/auth-helpers';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Settings, BookOpen, HelpCircle, LogOut, User, Menu } from 'lucide-react';
import InstallAppButton from '@/components/InstallAppButton';

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
  const [menuOpen, setMenuOpen] = useState(false);

  // Check userId prop first, fallback to localStorage for pages that don't pass the prop
  const isLoggedIn = !!userId || !!localStorage.getItem('userId');

  // Check if we're on a "learn more" related page
  const isOnLearnMorePages = location === '/learn-more' || location === '/meditations' || location === '/videos';

  const handleSignOut = async () => {
    if (setUserId && !loggingOut) {
      setLoggingOut(true);
      setMenuOpen(false);
      try {
        await handleLogout(setUserId);
      } catch (error) {
        console.error('Logout error:', error);
        setLoggingOut(false);
      }
    }
  };

  const handleNavigation = (path: string) => {
    setMenuOpen(false);
    setLocation(path);
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

            {/* Install App Button - Shows when PWA installation is available */}
            <InstallAppButton />

            {/* Menu Sheet - Shown when logged in */}
            {isLoggedIn ? (
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    className="text-sm backdrop-filter backdrop-blur-md bg-transparent border border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all"
                    data-testid="button-settings"
                  >
                    <Menu className="h-4 w-4 mr-2" />
                    Menu
                  </Button>
                </SheetTrigger>
                <SheetContent 
                  side="right" 
                  className="glass-strong border-white/10 backdrop-blur-xl bg-background/95"
                >
                  <SheetHeader>
                    <SheetTitle className="text-emerald-500/80 flex items-center">
                      <User className="h-4 w-4 mr-2" />
                      {userType ? userType.charAt(0).toUpperCase() + userType.slice(1) : 'User'} Menu
                    </SheetTitle>
                  </SheetHeader>

                  <div className="flex flex-col gap-2 mt-6">
                    <Button
                      variant="ghost"
                      onClick={() => handleNavigation('/settings')}
                      className="w-full justify-start hover:bg-emerald-500/10"
                    >
                      <Settings className="h-4 w-4 mr-3" />
                      Settings
                    </Button>

                    <div className="h-px bg-white/10 my-2" />

                    <Button
                      variant="ghost"
                      onClick={() => handleNavigation('/learn-more')}
                      className="w-full justify-start hover:bg-emerald-500/10"
                    >
                      <BookOpen className="h-4 w-4 mr-3" />
                      More+
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() => handleNavigation('/faq')}
                      className="w-full justify-start hover:bg-emerald-500/10"
                      data-testid="menu-item-faq"
                    >
                      <HelpCircle className="h-4 w-4 mr-3" />
                      FAQ
                    </Button>

                    <div className="h-px bg-white/10 my-2" />

                    <Button
                      variant="ghost"
                      onClick={handleSignOut}
                      disabled={loggingOut}
                      className="w-full justify-start hover:bg-red-500/10 text-red-400"
                      data-testid="menu-item-signout"
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      {loggingOut ? 'Signing Out...' : 'Sign Out'}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            ) : !isOnLearnMorePages ? (
              /* Buttons shown when not logged in (except on learn-more pages) */
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  className="text-sm backdrop-filter backdrop-blur-md bg-transparent border border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all"
                  onClick={() => setLocation('/learn-more')}
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  More+
                </Button>
                {!hideSignInButton && (
                  <Button
                    variant="ghost"
                    className="text-sm backdrop-filter backdrop-blur-md bg-emerald-500/10 border border-emerald-500/40 hover:border-emerald-500/60 hover:bg-emerald-500/15 shadow-[0_0_15px_rgba(0,208,98,0.2)] transition-all"
                    onClick={() => setLocation('/')}
                  >
                    Sign In
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}