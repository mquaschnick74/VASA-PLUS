// Location: server/middleware/auth.ts
import { createClient } from '@supabase/supabase-js';
import { Request, Response, NextFunction } from 'express';

// Create Supabase client for auth verification - USE SERVICE KEY
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                           process.env.SUPABASE_SERVICE_KEY || 
                           process.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SERVICE KEY in auth middleware');
  console.error('Available env vars:', {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
    VITE_SUPABASE_SERVICE_KEY: !!process.env.VITE_SUPABASE_SERVICE_KEY
  });
}

// Use SERVICE key for server-side auth verification
const supabase = createClient(
  supabaseUrl!,
  supabaseServiceKey!,
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
      console.log('Auth middleware - No token, skipping');
      return next();
    }

    // Use admin auth to verify the token
    const { data, error } = await supabase.auth.getUser(token);

    console.log('Auth middleware - Verification result:', { 
      hasUser: !!data?.user, 
      userId: data?.user?.id,
      error: error?.message 
    });

    if (!error && data.user) {
      req.user = data.user;
      req.token = token;
      console.log('✅ Auth middleware - User verified:', data.user.id);
    } else {
      console.warn('⚠️ Auth middleware - Token verification failed:', error?.message);
    }

    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
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
      console.error('RequireAuth - Verification failed:', error);
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = data.user;
    req.token = token;
    console.log('✅ RequireAuth - User verified:', data.user.id);
    next();
  } catch (error) {
    console.error('❌ RequireAuth error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}