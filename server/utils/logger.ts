import crypto from 'crypto';

const SENSITIVE_KEYS = [
  'authorization', 'auth', 'token', 'secret', 'password', 'api_key', 'apikey',
  'transcript', 'analysis', 'content', 'therapy', 'session_text', 'text', 'body', 'email',
];

const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /sk-[A-Za-z0-9_-]{10,}/g,
  /whsec_[A-Za-z0-9]+/g,
  /eyJ[A-Za-z0-9._-]+/g,
];

function sanitizeString(value: string): string {
  let sanitized = value;
  for (const pattern of SENSITIVE_PATTERNS) sanitized = sanitized.replace(pattern, '[REDACTED]');
  return sanitized;
}

export function redact<T>(value: T): T {
  if (typeof value === 'string') return sanitizeString(value) as T;
  if (Array.isArray(value)) return value.map((item) => redact(item)) as T;
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase();
    out[key] = SENSITIVE_KEYS.some((k) => lowered.includes(k)) ? '[REDACTED]' : redact(raw);
  }
  return out as T;
}

function logWith(level: 'log' | 'warn' | 'error', message: string, data?: unknown) {
  if (typeof data === 'undefined') {
    console[level](message);
    return;
  }
  console[level](message, redact(data));
}

export function info(message: string, data?: unknown) { logWith('log', message, data); }
export function warn(message: string, data?: unknown) { logWith('warn', message, data); }
export function error(message: string, data?: unknown) { logWith('error', message, data); }
export function createRequestId(): string { return crypto.randomUUID(); }
