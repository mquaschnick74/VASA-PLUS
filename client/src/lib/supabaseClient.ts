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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);