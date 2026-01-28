// Location: client/src/lib/push-notifications.ts
// Push notification service layer for iOS Capacitor app
// Uses static imports like other Capacitor plugins

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import type {
  Token,
  PushNotificationSchema,
  ActionPerformed,
  RegistrationError
} from '@capacitor/push-notifications';
import { getApiUrl } from './platform';

// Re-export types for consumers
export type { Token, PushNotificationSchema, ActionPerformed };

// Debug logging prefix
const LOG_PREFIX = '[PushNotifications]';

// Types for push notification preferences
export interface PushNotificationPreferences {
  push_notifications_enabled: boolean;
  session_reminders_enabled: boolean;
  therapeutic_followups_enabled: boolean;
  announcements_enabled: boolean;
  reminder_minutes_before: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

// Device token registration payload
export interface DeviceTokenPayload {
  token: string;
  platform: 'ios' | 'android' | 'web';
  device_model?: string;
  os_version?: string;
  app_version?: string;
}

// Notification action types
export type NotificationActionType = 'session_reminder' | 'therapeutic_followup' | 'announcement';

// Notification payload from APNs
export interface NotificationPayload {
  type?: NotificationActionType;
  session_id?: string;
  deep_link?: string;
  [key: string]: unknown;
}

// Callbacks for notification events
type NotificationCallback = (notification: PushNotificationSchema) => void;
type ActionCallback = (action: ActionPerformed) => void;

// Store callbacks for notification events
let notificationReceivedCallbacks: NotificationCallback[] = [];
let notificationActionCallbacks: ActionCallback[] = [];
let registrationErrorCallbacks: ((error: Error) => void)[] = [];

// Store the current token
let currentToken: string | null = null;

// Track if listeners are set up
let listenersSetUp = false;

/**
 * Check if push notifications are supported on this platform
 */
export function isPushNotificationsSupported(): boolean {
  try {
    const platform = Capacitor.getPlatform();
    const isNative = Capacitor.isNativePlatform();
    const isSupported = isNative && (platform === 'ios' || platform === 'android');

    console.log(`${LOG_PREFIX} isPushNotificationsSupported check:`, {
      platform,
      isNative,
      isSupported,
      capacitorAvailable: typeof Capacitor !== 'undefined',
      pushNotificationsAvailable: typeof PushNotifications !== 'undefined'
    });

    return isSupported;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in isPushNotificationsSupported:`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error
    });
    return false;
  }
}

/**
 * Check if push notifications are available (permission granted)
 */
export async function checkPushNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  console.log(`${LOG_PREFIX} checkPushNotificationPermission called`);

  if (!isPushNotificationsSupported()) {
    console.log(`${LOG_PREFIX} Push not supported, returning denied`);
    return 'denied';
  }

  try {
    console.log(`${LOG_PREFIX} Calling PushNotifications.checkPermissions()...`);
    const result = await PushNotifications.checkPermissions();
    console.log(`${LOG_PREFIX} checkPermissions result:`, result);
    return result.receive;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error checking push notification permission:`, {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error,
      errorStringified: JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2)
    });
    return 'denied';
  }
}

/**
 * Request push notification permission from the user
 */
export async function requestPushNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  console.log(`${LOG_PREFIX} requestPushNotificationPermission called`);

  if (!isPushNotificationsSupported()) {
    console.log(`${LOG_PREFIX} Push not supported, returning denied`);
    return 'denied';
  }

  try {
    console.log(`${LOG_PREFIX} Calling PushNotifications.requestPermissions()...`);
    const result = await PushNotifications.requestPermissions();
    console.log(`${LOG_PREFIX} requestPermissions result:`, result);
    return result.receive;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error requesting push notification permission:`, {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error,
      errorStringified: JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2)
    });
    return 'denied';
  }
}

/**
 * Initialize push notifications and set up listeners
 * Should be called early in app lifecycle after authentication
 */
export async function initializePushNotifications(): Promise<void> {
  console.log(`${LOG_PREFIX} ========================================`);
  console.log(`${LOG_PREFIX} initializePushNotifications() CALLED`);
  console.log(`${LOG_PREFIX} Platform:`, Capacitor.getPlatform());
  console.log(`${LOG_PREFIX} Is Native:`, Capacitor.isNativePlatform());
  console.log(`${LOG_PREFIX} PushNotifications object:`, typeof PushNotifications);
  console.log(`${LOG_PREFIX} ========================================`);

  if (!isPushNotificationsSupported()) {
    console.log(`${LOG_PREFIX} Push notifications not supported on this platform, exiting`);
    return;
  }

  try {
    // Set up listeners first (before checking permission)
    console.log(`${LOG_PREFIX} Setting up push notification listeners...`);
    await setupPushNotificationListeners();
    console.log(`${LOG_PREFIX} Listeners set up successfully`);

    // Check current permission status
    console.log(`${LOG_PREFIX} Checking current permission status...`);
    const permission = await checkPushNotificationPermission();
    console.log(`${LOG_PREFIX} Current permission status:`, permission);

    if (permission === 'granted') {
      console.log(`${LOG_PREFIX} Permission granted, registering with APNs...`);
      await registerWithAPNs();
    } else {
      console.log(`${LOG_PREFIX} Permission not granted (${permission}), skipping APNs registration`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error in initializePushNotifications:`, {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error,
      errorStringified: JSON.stringify(error, Object.getOwnPropertyNames(error as object), 2)
    });
  }
}

/**
 * Request permission and register for push notifications
 * Call this when user enables push notifications in settings
 */
export async function enablePushNotifications(): Promise<boolean> {
  console.log(`${LOG_PREFIX} enablePushNotifications() called`);

  if (!isPushNotificationsSupported()) {
    console.log(`${LOG_PREFIX} Push not supported, returning false`);
    return false;
  }

  try {
    // Set up listeners if not already done
    console.log(`${LOG_PREFIX} Setting up listeners...`);
    await setupPushNotificationListeners();

    // Request permission
    console.log(`${LOG_PREFIX} Requesting permission...`);
    const permission = await requestPushNotificationPermission();
    console.log(`${LOG_PREFIX} Permission result:`, permission);

    if (permission !== 'granted') {
      console.log(`${LOG_PREFIX} Permission not granted, returning false`);
      return false;
    }

    // Register with APNs
    console.log(`${LOG_PREFIX} Registering with APNs...`);
    await registerWithAPNs();
    console.log(`${LOG_PREFIX} APNs registration complete, returning true`);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error enabling push notifications:`, {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error
    });
    return false;
  }
}

/**
 * Register with APNs to get device token
 */
async function registerWithAPNs(): Promise<void> {
  try {
    console.log(`${LOG_PREFIX} registerWithAPNs() - Calling PushNotifications.register()...`);
    await PushNotifications.register();
    console.log(`${LOG_PREFIX} registerWithAPNs() - Registration call completed`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error registering with APNs:`, {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error
    });
  }
}

/**
 * Set up listeners for push notification events
 */
async function setupPushNotificationListeners(): Promise<void> {
  if (listenersSetUp) {
    console.log(`${LOG_PREFIX} Listeners already set up, skipping`);
    return;
  }

  console.log(`${LOG_PREFIX} Setting up push notification listeners...`);

  try {
    // Remove any existing listeners first
    console.log(`${LOG_PREFIX} Removing existing listeners...`);
    await PushNotifications.removeAllListeners();

    // Registration successful - token received
    console.log(`${LOG_PREFIX} Adding registration listener...`);
    await PushNotifications.addListener('registration', (token: Token) => {
      console.log(`${LOG_PREFIX} ✅ REGISTRATION SUCCESS - Token received:`, token.value);
      currentToken = token.value;
    });

    // Registration error
    console.log(`${LOG_PREFIX} Adding registrationError listener...`);
    await PushNotifications.addListener('registrationError', (error: RegistrationError) => {
      console.error(`${LOG_PREFIX} ❌ REGISTRATION ERROR:`, error.error);
      registrationErrorCallbacks.forEach(callback => callback(new Error(error.error)));
    });

    // Notification received while app is in foreground
    console.log(`${LOG_PREFIX} Adding pushNotificationReceived listener...`);
    await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log(`${LOG_PREFIX} 📬 Notification received in foreground:`, notification);
      notificationReceivedCallbacks.forEach(callback => callback(notification));
    });

    // User tapped on notification
    console.log(`${LOG_PREFIX} Adding pushNotificationActionPerformed listener...`);
    await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log(`${LOG_PREFIX} 👆 Notification action performed:`, action);
      notificationActionCallbacks.forEach(callback => callback(action));
    });

    listenersSetUp = true;
    console.log(`${LOG_PREFIX} ✅ All listeners set up successfully`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error setting up push notification listeners:`, {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error
    });
  }
}

/**
 * Get the current device token (if registered)
 */
export function getCurrentToken(): string | null {
  return currentToken;
}

/**
 * Register callback for when notification is received in foreground
 */
export function onNotificationReceived(callback: NotificationCallback): () => void {
  notificationReceivedCallbacks.push(callback);
  return () => {
    notificationReceivedCallbacks = notificationReceivedCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Register callback for when user taps on notification
 */
export function onNotificationAction(callback: ActionCallback): () => void {
  notificationActionCallbacks.push(callback);
  return () => {
    notificationActionCallbacks = notificationActionCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Register callback for registration errors
 */
export function onRegistrationError(callback: (error: Error) => void): () => void {
  registrationErrorCallbacks.push(callback);
  return () => {
    registrationErrorCallbacks = registrationErrorCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Register device token with backend
 */
export async function registerDeviceToken(token: string, authToken: string): Promise<boolean> {
  try {
    const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

    const payload: DeviceTokenPayload = {
      token,
      platform,
    };

    const response = await fetch(getApiUrl('/api/push-notifications/register-token'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`${LOG_PREFIX} Failed to register device token:`, errorData);
      return false;
    }

    console.log(`${LOG_PREFIX} Device token registered successfully`);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error registering device token:`, error);
    return false;
  }
}

/**
 * Unregister device token from backend (when user disables notifications)
 */
export async function unregisterDeviceToken(authToken: string): Promise<boolean> {
  const token = getCurrentToken();
  if (!token) {
    return true;
  }

  try {
    const response = await fetch(getApiUrl('/api/push-notifications/unregister-token'), {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`${LOG_PREFIX} Failed to unregister device token:`, errorData);
      return false;
    }

    console.log(`${LOG_PREFIX} Device token unregistered successfully`);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error unregistering device token:`, error);
    return false;
  }
}

/**
 * Fetch user's push notification preferences from backend
 */
export async function fetchPushNotificationPreferences(
  userId: string,
  authToken: string
): Promise<PushNotificationPreferences | null> {
  try {
    const response = await fetch(getApiUrl(`/api/push-notifications/preferences/${userId}`), {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`${LOG_PREFIX} Failed to fetch push preferences:`, errorData);
      return null;
    }

    const data = await response.json();
    return data.preferences;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error fetching push preferences:`, error);
    return null;
  }
}

/**
 * Update user's push notification preferences on backend
 */
export async function updatePushNotificationPreferences(
  userId: string,
  preferences: Partial<PushNotificationPreferences>,
  authToken: string
): Promise<PushNotificationPreferences | null> {
  try {
    const response = await fetch(getApiUrl(`/api/push-notifications/preferences/${userId}`), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preferences)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`${LOG_PREFIX} Failed to update push preferences:`, errorData);
      return null;
    }

    const data = await response.json();
    return data.preferences;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error updating push preferences:`, error);
    return null;
  }
}

/**
 * Handle deep link from notification payload
 */
export function handleNotificationDeepLink(payload: NotificationPayload): string | null {
  if (payload.deep_link) {
    return payload.deep_link;
  }

  switch (payload.type) {
    case 'session_reminder':
      return payload.session_id ? `/session/${payload.session_id}` : '/dashboard';
    case 'therapeutic_followup':
      return '/dashboard';
    case 'announcement':
      return '/dashboard';
    default:
      return null;
  }
}

/**
 * Clear all notification badges
 */
export async function clearBadges(): Promise<void> {
  if (!isPushNotificationsSupported()) {
    return;
  }
  // On iOS, the badge is cleared automatically when opening the app
}

/**
 * Get the list of delivered notifications
 */
export async function getDeliveredNotifications(): Promise<PushNotificationSchema[]> {
  if (!isPushNotificationsSupported()) {
    return [];
  }

  try {
    const result = await PushNotifications.getDeliveredNotifications();
    return result.notifications;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error getting delivered notifications:`, error);
    return [];
  }
}

/**
 * Remove all delivered notifications from notification center
 */
export async function removeAllDeliveredNotifications(): Promise<void> {
  if (!isPushNotificationsSupported()) {
    return;
  }

  try {
    await PushNotifications.removeAllDeliveredNotifications();
  } catch (error) {
    console.error(`${LOG_PREFIX} Error removing delivered notifications:`, error);
  }
}
