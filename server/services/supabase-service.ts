// Location: server/services/supabase-service.ts
import { createClient } from '@supabase/supabase-js';

// Try multiple possible environment variable names for SERVICE key
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                          process.env.SUPABASE_SERVICE_KEY ||
                          process.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl) {
  console.error('❌ MISSING SUPABASE_URL - Add to your .env file');
  throw new Error('Missing SUPABASE_URL');
}

if (!supabaseServiceKey) {
  console.error('❌ MISSING SERVICE KEY - Add one of these to your .env file:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY (preferred)');
  console.error('   SUPABASE_SERVICE_KEY'); 
  console.error('   VITE_SUPABASE_SERVICE_KEY');
  throw new Error('Missing Supabase SERVICE key (not ANON key)');
}

console.log('✅ Supabase service initialized with URL:', supabaseUrl);
console.log('✅ Using service key from env variable');

export const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export interface User {
  id: string;
  email: string;
  first_name: string;
  auth_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TherapeuticSession {
  id: string;
  user_id: string;
  call_id: string;
  agent_name: string;
  status: string;
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface TherapeuticContext {
  id: string;
  user_id: string;
  call_id?: string;
  context_type: string;
  content: string;
  confidence: number;
  importance: number;
  created_at: string;
}

export interface SessionTranscript {
  id: string;
  user_id: string;
  call_id: string;
  text: string;
  role: string;
  timestamp: string;
}