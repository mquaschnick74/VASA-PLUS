const PRESENCE_CHECK_PHRASES: string[] = [
  'are you still there',
  'are you there',
  'can you hear me',
  'did you hear me',
  'hello',
  'are you with me',
  'did you get that',
];

export function normalizePresenceCheckText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseToBoundedRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`);
}

const PRESENCE_CHECK_PATTERNS: RegExp[] = PRESENCE_CHECK_PHRASES.map(phraseToBoundedRegex);

export function containsPresenceCheckPhrase(normalizedText: string): boolean {
  if (!normalizedText) return false;
  return PRESENCE_CHECK_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

export function isPresenceCheckUtterance(text: string): boolean {
  const normalized = normalizePresenceCheckText(text);
  return containsPresenceCheckPhrase(normalized);
}
