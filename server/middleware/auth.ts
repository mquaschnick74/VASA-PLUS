import { createClient } from '@supabase/supabase-js';
import { Request, Response, NextFunction } from 'express';

type UserContext = {
  internalUserId?: string;
  internalUserType?: string;
  expiresAt: number;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or Supabase service role key for auth middleware');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const CONTEXT_TTL_MS = 90_000;
const userContextCache = new Map<string, UserContext>();

export interface AuthRequest extends Request {
  user?: any;
  token?: string;
  internalUserId?: string;
  internalUserType?: string;
}

function parseBearerToken(authHeader?: string): string | undefined {
  if (!authHeader) return undefined;
  const [scheme, value] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !value) return undefined;
  return value;
}

async function resolveUserContext(authUserId: string): Promise<UserContext> {
  const now = Date.now();
  const cached = userContextCache.get(authUserId);
  if (cached && cached.expiresAt > now) return cached;

  const { data: userRow } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  let context: UserContext = { expiresAt: now + CONTEXT_TTL_MS };

  if (userRow?.id) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('user_type')
      .eq('id', userRow.id)
      .maybeSingle();

    context = {
      internalUserId: userRow.id,
      internalUserType: profile?.user_type,
      expiresAt: now + CONTEXT_TTL_MS,
    };
  }

  userContextCache.set(authUserId, context);
  return context;
}

export async function authenticateToken(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const token = parseBearerToken(req.headers['authorization']);
    if (!token) return next();

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return next();

    req.user = data.user;
    req.token = token;

    const context = await resolveUserContext(data.user.id);
    req.internalUserId = context.internalUserId;
    req.internalUserType = context.internalUserType;

    next();
  } catch {
    next();
  }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = parseBearerToken(req.headers['authorization']);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    req.user = data.user;
    req.token = token;

    const context = await resolveUserContext(data.user.id);
    if (!context.internalUserId) {
      return res.status(403).json({ error: 'User is not provisioned in app database', code: 'USER_NOT_PROVISIONED' });
    }

    req.internalUserId = context.internalUserId;
    req.internalUserType = context.internalUserType;

    next();
  } catch {
    res.status(500).json({ error: 'Authentication error' });
  }
}
