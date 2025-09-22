import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export interface User {
  id: string;
  email: string;
  first_name: string;
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
