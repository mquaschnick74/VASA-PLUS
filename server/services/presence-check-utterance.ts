const PRESENCE_CHECK_PATTERNS: RegExp[] = [
  /^are you still there$/,
  /^are you there$/,
  /^can you hear me$/,
  /^did you hear me$/,
  /^hello$/,
  /^are you with me$/,
  /^did you get that$/,
];

function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPresenceCheckUtterance(text: string): boolean {
  const normalized = normalizeUtterance(text);
  if (!normalized) return false;
  return PRESENCE_CHECK_PATTERNS.some((pattern) => pattern.test(normalized));
}

