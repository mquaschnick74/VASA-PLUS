// Location: server/middleware/auth.ts
import { createClient } from '@supabase/supabase-js';
import { Request, Response, NextFunction } from 'express';

// Create Supabase client for auth verification
// MUST use service key for server-side auth verification
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or service key in auth middleware');
  console.error('Available env vars:', {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY
  });
}

// Create admin client with service role key
const supabase = createClient(
  supabaseUrl!,
  supabaseKey!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export interface AuthRequest extends Request {
  user?: any;
  token?: string;
}

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('Auth middleware - Token exists:', !!token);

    if (!token) {
      return next();
    }

    const { data, error } = await supabase.auth.getUser(token);

    console.log('Auth middleware - Supabase response:', { 
      hasUser: !!data?.user, 
      error: error?.message,
      userId: data?.user?.id,
      email: data?.user?.email
    });

    if (!error && data.user) {
      req.user = data.user;
      req.token = token;
      console.log('✅ Auth middleware - User attached:', data.user.email);
    } else {
      console.log('❌ Auth middleware - Failed to get user:', error?.message);
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    next();
  }
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_TOKEN' 
      });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      console.error('❌ Token verification failed:', error);
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
        details: error?.message
      });
    }

    req.user = data.user;
    req.token = token;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}