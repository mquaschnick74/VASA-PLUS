import { Capacitor } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();
export const isIOS = Capacitor.getPlatform() === 'ios';
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isWeb = !isNativeApp;

// API base URL - use full URL for native apps, relative for web
export const API_BASE_URL = isNativeApp ? 'https://beta.ivasa.ai' : '';

// Helper function to get full API URL
export function getApiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
