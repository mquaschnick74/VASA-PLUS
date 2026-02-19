// client/src/lib/apiFetch.ts
// Authenticated fetch helper that obtains the Bearer token from
// Supabase's session rather than localStorage, eliminating the need
// to persist raw tokens in browser storage.

import { supabase } from './supabaseClient';
import { getApiUrl, isNativeApp } from './platform';

/**
 * Fetch wrapper that automatically attaches the current Supabase session
 * access_token as a Bearer Authorization header.
 *
 * @param path    - API path (e.g., '/api/auth/user'). Will be resolved via getApiUrl.
 * @param options - Standard RequestInit options. Authorization header is added automatically
 *                  unless you explicitly provide one.
 * @returns The fetch Response.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(options.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(getApiUrl(path), {
    ...options,
    headers,
    // Include credentials for same-origin cookie forwarding (web only)
    ...(isNativeApp ? {} : { credentials: 'include' as RequestCredentials }),
  });
}
