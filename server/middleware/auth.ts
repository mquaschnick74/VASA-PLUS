// Location: server/middleware/auth.ts

import { createClient } from '@supabase/supabase-js';
import { Request, Response, NextFunction } from 'express';

// Create Supabase client for auth verification
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY! // Use ANON key for verifying tokens
);

// Extend Express Request type to include user
export interface AuthRequest extends Request {
  user?: any;
  token?: string;
}

// Middleware to validate tokens
export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // No token provided - could be legacy user
      return next();
    }

    // Verify token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (!error && data.user) {
      // Valid token - attach user to request
      req.user = data.user;
      req.token = token;
    }

    // Continue regardless (for backward compatibility)
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    // Don't block the request, just continue without auth
    next();
  }
}

// Strict middleware that REQUIRES authentication
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

    // Verify token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Valid token - attach user to request
    req.user = data.user;
    req.token = token;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}