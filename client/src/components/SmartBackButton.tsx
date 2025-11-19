// Location: client/src/components/SmartBackButton.tsx
// Smart navigation button that shows different destinations based on auth status

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface SmartBackButtonProps {
  className?: string;
}

export default function SmartBackButton({ className }: SmartBackButtonProps) {
  const [, setLocation] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (isAuthenticated) {
      setLocation('/dashboard');
    } else {
      setLocation('/learn-more');
    }
  };

  if (loading) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      onClick={handleBack}
      className={className || "mb-6 text-purple-300 hover:text-white hover:bg-white/10"}
    >
      <ArrowLeft className="w-4 h-4 mr-2" />
      {isAuthenticated ? 'Back to Dashboard' : 'Back to Resources'}
    </Button>
  );
}
