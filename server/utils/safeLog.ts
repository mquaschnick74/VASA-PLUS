// server/utils/safeLog.ts
// Structured, safe-by-default logger that redacts sensitive data
// and sanitizes user-input IDs before writing JSON lines to stdout/stderr.

const REDACTED_KEYS = new Set([
  'authorization',
  'token',
  'access_token',
  'refresh_token',
  'authtoken',
  'password',
  'email',
  'phone',
  'sexualorientation',
  'sexorientation',
]);

const ID_KEYS = new Set([
  'callid',
  'authuserid',
  'userid',
]);

const isDev = process.env.NODE_ENV !== 'production';

/** Truncate an ID string to first 8 chars + ellipsis */
function truncateId(value: string): string {
  if (value.length <= 8) return value;
  return value.slice(0, 8) + '\u2026'; // '…'
}

/** Safely extract { name, message } from an error, with optional truncated stack in dev */
function sanitizeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      name: err.name,
      message: err.message,
    };
    if (isDev && err.stack) {
      // Keep first 3 stack frames
      const frames = err.stack.split('\n').slice(0, 4);
      out.stack = frames.join('\n');
    }
    return out;
  }
  if (typeof err === 'string') {
    return { message: err };
  }
  return { message: String(err) };
}

/** Deep-redact an object, sanitizing sensitive keys and ID fields */
function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Error) {
    return sanitizeError(value);
  }

  if (typeof value === 'string') {
    // Redact JWT-like strings that might be tokens
    if (value.startsWith('eyJ') && value.length > 30) return '[REDACTED]';
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();

      if (REDACTED_KEYS.has(lower)) {
        out[key] = '[REDACTED]';
        continue;
      }

      if (ID_KEYS.has(lower) && typeof raw === 'string') {
        out[key] = truncateId(raw);
        continue;
      }

      // Recursively handle nested 'error' keys
      if (lower === 'error') {
        out[key] = sanitizeError(raw);
        continue;
      }

      out[key] = redactValue(raw);
    }
    return out;
  }

  return String(value);
}

/**
 * Write a structured JSON log line to stdout (info/warn) or stderr (error).
 *
 * @param level  - 'info' | 'warn' | 'error'
 * @param event  - A snake_case event name (e.g., 'retroactive_session_create_failed')
 * @param data   - Optional payload to include (will be deeply redacted)
 */
export function safeLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  data?: unknown,
): void {
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
  };

  if (data !== undefined) {
    entry.data = redactValue(data);
  }

  const line = JSON.stringify(entry) + '\n';

  if (level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}
