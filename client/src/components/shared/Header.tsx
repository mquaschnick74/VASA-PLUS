// Location: client/src/components/shared/Header.tsx
// Shared navigation header component for all pages

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { handleLogout } from '@/lib/auth-helpers';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Settings, BookOpen, HelpCircle, LogOut, User } from 'lucide-react';

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

            {/* Settings Dropdown - Shown when logged in */}
            {isLoggedIn ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="text-sm backdrop-filter backdrop-blur-md bg-transparent border border-emerald-500/30 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all"
                    data-testid="button-settings"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Menu
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 glass-strong border-white/10 backdrop-blur-xl"
                >
                  <DropdownMenuLabel className="text-emerald-500/80">
                    <User className="h-4 w-4 inline mr-2" />
                    {userType ? userType.charAt(0).toUpperCase() + userType.slice(1) : 'User'} Menu
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />

                  <DropdownMenuItem
                    onClick={() => setLocation('/settings')}
                    className="cursor-pointer hover:bg-emerald-500/10 focus:bg-emerald-500/10"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-white/10" />

                  <DropdownMenuItem
                    onClick={() => setLocation('/blog')}
                    className="cursor-pointer hover:bg-emerald-500/10 focus:bg-emerald-500/10"
                  >
                    <BookOpen className="h-4 w-4 mr-2" />
                    Learn More
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => setLocation('/faq')}
                    className="cursor-pointer hover:bg-emerald-500/10 focus:bg-emerald-500/10"
                    data-testid="menu-item-faq"
                  >
                    <HelpCircle className="h-4 w-4 mr-2" />
                    FAQ
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="bg-white/10" />

                  <DropdownMenuItem
                    onClick={handleSignOut}
                    disabled={loggingOut}
                    className="cursor-pointer hover:bg-red-500/10 focus:bg-red-500/10 text-red-400"
                    data-testid="menu-item-signout"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {loggingOut ? 'Signing Out...' : 'Sign Out'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : !hideSignInButton && (
              /* Sign In Button - Shown when not logged in */
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
