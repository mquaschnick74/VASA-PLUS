import { Capacitor } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();
export const isIOS = Capacitor.getPlatform() === 'ios';
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isWeb = !isNativeApp;

// Production URL for external services (VAPI webhooks, etc.)
export const PRODUCTION_URL = 'https://beta.ivasa.ai';

// API base URL - use full URL for native apps, relative for web
export const API_BASE_URL = isNativeApp ? PRODUCTION_URL : '';

// Helper function to get full API URL
export function getApiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

// Helper function to get absolute URL for external services (VAPI, webhooks, etc.)
// This always returns an absolute URL, even on web
export function getAbsoluteUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  // On web, use window.location.origin in dev, PRODUCTION_URL in production
  if (isWeb) {
    // Check if we're in production or development
    const origin = typeof window !== 'undefined' ? window.location.origin : PRODUCTION_URL;
    // In production, use the production URL; in dev, use current origin
    const isProduction = origin.includes('beta.ivasa.ai') || origin.includes('ivasa.ai');
    return isProduction ? `${PRODUCTION_URL}${normalizedPath}` : `${origin}${normalizedPath}`;
  }
  return `${PRODUCTION_URL}${normalizedPath}`;
}
