// Location: client/src/lib/auth-helpers.ts
// Centralized authentication helper functions

import { supabase } from './supabaseClient';

/**
 * Wraps a promise with a timeout to prevent hanging operations
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds (default: 3000ms)
 * @returns The promise result or throws a timeout error
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 3000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    )
  ]);
}

/**
 * Handles user logout with proper cleanup
 * Prevents frozen states by ensuring all cleanup happens in the correct order
 * Uses timeout wrapper to prevent hanging if Supabase session is invalid/expired
 */
export async function handleLogout(setUserId: (id: string | null) => void) {
  console.log('🔓 [AUTH-HELPER] Starting logout process...');

  try {
    // Mark this as an intentional sign-out
    sessionStorage.setItem('intentionalSignOut', 'true');

    // Sign out from Supabase with timeout protection (3 second timeout)
    // This prevents the UI from hanging if the session is expired or connection is lost
    try {
      await withTimeout(supabase.auth.signOut(), 3000);
      console.log('✅ [AUTH-HELPER] Supabase sign out complete');
    } catch (signOutError) {
      console.warn('⚠️ [AUTH-HELPER] Supabase sign out timed out or failed:', signOutError);
      console.log('🔄 [AUTH-HELPER] Continuing with local cleanup...');
      // Continue with cleanup even if signOut fails/times out
    }

    // Clear all storage
    localStorage.clear();
    sessionStorage.clear();

    // Update state
    setUserId(null);

    // Force navigation to root
    window.location.href = '/';

  } catch (error) {
    console.error('❌ [AUTH-HELPER] Logout error:', error);

    // Even if there's an error, force cleanup
    localStorage.clear();
    sessionStorage.clear();
    setUserId(null);
    window.location.href = '/';
  }
}

/**
 * Checks if the current session is still valid
 * Returns true if valid, false if expired
 */
export async function checkSessionValid(): Promise<boolean> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('❌ [AUTH-HELPER] Session check error:', error);
      return false;
    }

    return !!session;
  } catch (error) {
    console.error('❌ [AUTH-HELPER] Session check failed:', error);
    return false;
  }
}

/**
 * Refreshes the current session if needed
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      console.error('❌ [AUTH-HELPER] Session refresh error:', error);
      return false;
    }

    if (data.session) {
      console.log('✅ [AUTH-HELPER] Session refreshed successfully');
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ [AUTH-HELPER] Session refresh failed:', error);
    return false;
  }
}