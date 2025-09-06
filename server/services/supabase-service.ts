import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../../shared/schema';

// Use Neon database connection
const neonUrl = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}/${process.env.PGDATABASE}?sslmode=require`;
const sql = neon(neonUrl);
export const db = drizzle(sql, { schema });

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
