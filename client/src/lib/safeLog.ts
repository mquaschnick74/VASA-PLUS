// client/src/lib/safeLog.ts
// Client-side safe logger that redacts sensitive data before console output.
// Tokens, passwords, and PII are never logged.

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

const MAX_STRING_LENGTH = 200;

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    // Redact JWT-like strings
    if (value.startsWith('eyJ') && value.length > 30) return '[REDACTED]';
    // Truncate long strings
    if (value.length > MAX_STRING_LENGTH) {
      return value.slice(0, MAX_STRING_LENGTH) + '\u2026';
    }
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (REDACTED_KEYS.has(lower)) {
        out[key] = '[REDACTED]';
      } else if (lower === 'error' && raw instanceof Error) {
        out[key] = { name: raw.name, message: raw.message };
      } else {
        out[key] = redactValue(raw);
      }
    }
    return out;
  }

  return String(value);
}

/**
 * Safe client-side logger. Redacts sensitive keys and truncates long strings.
 * Never logs tokens, passwords, or PII.
 *
 * @param event - A descriptive event name (e.g., 'voice_text_mode_init')
 * @param data  - Optional payload (deeply redacted before logging)
 */
export function safeLog(event: string, data?: unknown): void {
  if (data !== undefined) {
    console.log(`[${event}]`, redactValue(data));
  } else {
    console.log(`[${event}]`);
  }
}
