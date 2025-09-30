// Location: client/src/lib/supabaseClient.ts

import { createClient } from '@supabase/supabase-js';

// This client is ONLY for authentication on the frontend
// It uses the ANON key which is safe to expose in browser
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file'
  );
}

// Create ONCE and export with proper auth configuration
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,        // Keep session alive across refreshes
    autoRefreshToken: true,       // Auto-refresh tokens before expiry
    detectSessionInUrl: true,     // For email confirmations
    storage: window.localStorage, // Explicitly use localStorage
    storageKey: 'ivasa-auth-token' // Custom key to avoid conflicts
  }
});

// Prevent multiple instances in development
if (import.meta.env.DEV) {
  if ((window as any).supabaseClient) {
    console.warn('⚠️ Multiple Supabase instances detected!');
  }
  (window as any).supabaseClient = supabase;
}

// Debug helper - run `checkAuth()` in browser console
(window as any).checkAuth = async () => {
  console.log('🔍 Checking auth state...');
  
  // Get current session
  const { data: { session }, error } = await supabase.auth.getSession();
  console.log('Current session:', session);
  console.log('Session error:', error);
  
  // Check localStorage
  const storedSession = localStorage.getItem('ivasa-auth-token');
  console.log('Stored token exists:', !!storedSession);
  
  // Check token expiry
  if (session?.expires_at) {
    const expiresAt = new Date(session.expires_at * 1000);
    const now = new Date();
    console.log('Token expires at:', expiresAt);
    console.log('Time until expiry:', Math.round((expiresAt.getTime() - now.getTime()) / 1000 / 60), 'minutes');
  }
  
  // Test refresh
  console.log('Testing token refresh...');
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  console.log('Refresh result:', refreshData ? 'SUCCESS' : 'FAILED');
  console.log('Refresh error:', refreshError);
  
  return {
    session,
    hasToken: !!storedSession,
    expiresAt: session?.expires_at ? new Date(session.expires_at * 1000) : null,
    refreshWorks: !!refreshData
  };
};