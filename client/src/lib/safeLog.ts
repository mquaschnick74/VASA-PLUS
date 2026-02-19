// client/src/lib/safeLog.ts
// Client-side safe logger that redacts sensitive data before console output.

const REDACTED_KEYS = new Set([
  "authorization",
  "token",
  "access_token",
  "refresh_token",
  "authtoken",
  "password",
  "email",
  "phone",
  "sexualorientation",
  "sexorientation",
]);

const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 50;

function looksLikeJwt(value: string): boolean {
  if (!value.startsWith("eyJ")) return false;
  const parts = value.split(".");
  return parts.length === 3 && value.length > 40;
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (looksLikeJwt(value)) return "[REDACTED]";
    if (value.length > MAX_STRING_LENGTH) return value.slice(0, MAX_STRING_LENGTH) + "\u2026";
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (Array.isArray(value)) {
    const trimmed = value.slice(0, MAX_ARRAY_LENGTH).map(redactValue);
    return value.length > MAX_ARRAY_LENGTH ? [...trimmed, `…(+${value.length - MAX_ARRAY_LENGTH} more)`] : trimmed;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const limited = entries.slice(0, MAX_OBJECT_KEYS);

    const out: Record<string, unknown> = {};
    for (const [key, raw] of limited) {
      const lower = key.toLowerCase();
      if (REDACTED_KEYS.has(lower)) out[key] = "[REDACTED]";
      else if (lower === "error" && raw instanceof Error) out[key] = { name: raw.name, message: raw.message };
      else out[key] = redactValue(raw);
    }

    if (entries.length > MAX_OBJECT_KEYS) {
      out["__truncated__"] = `+${entries.length - MAX_OBJECT_KEYS} keys`;
    }
    return out;
  }

  return String(value);
}

export function safeLog(event: string, data?: unknown): void {
  if (data !== undefined) console.log(`[${event}]`, redactValue(data));
  else console.log(`[${event}]`);
}
