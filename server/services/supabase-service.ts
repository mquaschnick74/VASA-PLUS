// Location: server/services/supabase-service.ts

import { createClient } from '@supabase/supabase-js';

// Handle both possible environment variable names
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                   process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.error('Available SUPABASE vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  throw new Error(
    'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)'
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
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