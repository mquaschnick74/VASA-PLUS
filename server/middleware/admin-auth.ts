// Location: server/middleware/admin-auth.ts
// Middleware to verify user has admin privileges

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase-service';

export interface AdminRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export async function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.substring(7);

    // Verify token with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // First, get the internal user ID from the users table using auth_user_id
    const { data: internalUser, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('auth_user_id', user.id)
      .single();

    if (userError || !internalUser) {
      return res.status(404).json({ error: 'User not found in system' });
    }

    // Now get user profile using the internal user ID
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, user_type')
      .eq('id', internalUser.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // Check if user is admin
    if (profile.user_type !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied. Admin privileges required.',
        userType: profile.user_type 
      });
    }

    // Attach user info to request
    req.userId = profile.id;
    req.userEmail = profile.email;

    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}