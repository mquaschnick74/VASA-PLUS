import { supabase } from '@/lib/supabaseClient';

export async function handleLogout(setUserId?: (id: string | null) => void) {
  try {
    console.log('👋 Logging out user...');
    await supabase.auth.signOut();
    
    if (setUserId) {
      setUserId(null);
    }
    
    window.location.href = '/';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/';
  }
}
