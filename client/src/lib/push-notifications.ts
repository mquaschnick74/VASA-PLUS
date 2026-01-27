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
  // Only supported on native iOS/Android
  const platform = Capacitor.getPlatform();
  return Capacitor.isNativePlatform() && (platform === 'ios' || platform === 'android');
}

/**
 * Check if push notifications are available (permission granted)
 */
export async function checkPushNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!isPushNotificationsSupported()) {
    return 'denied';
  }

  try {
    const result = await PushNotifications.checkPermissions();
    return result.receive;
  } catch (error) {
    console.error('Error checking push notification permission:', error);
    return 'denied';
  }
}

/**
 * Request push notification permission from the user
 */
export async function requestPushNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!isPushNotificationsSupported()) {
    return 'denied';
  }

  try {
    const result = await PushNotifications.requestPermissions();
    return result.receive;
  } catch (error) {
    console.error('Error requesting push notification permission:', error);
    return 'denied';
  }
}

/**
 * Initialize push notifications and set up listeners
 * Should be called early in app lifecycle after authentication
 */
export async function initializePushNotifications(): Promise<void> {
  if (!isPushNotificationsSupported()) {
    console.log('Push notifications not supported on this platform');
    return;
  }

  // Set up listeners first (before checking permission)
  await setupPushNotificationListeners();

  // Check current permission status
  const permission = await checkPushNotificationPermission();
  console.log('Push notification permission status:', permission);

  if (permission === 'granted') {
    // Register with APNs
    await registerWithAPNs();
  }
}

/**
 * Request permission and register for push notifications
 * Call this when user enables push notifications in settings
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!isPushNotificationsSupported()) {
    return false;
  }

  try {
    // Set up listeners if not already done
    await setupPushNotificationListeners();

    // Request permission
    const permission = await requestPushNotificationPermission();
    console.log('Push notification permission result:', permission);

    if (permission !== 'granted') {
      console.log('Push notification permission not granted');
      return false;
    }

    // Register with APNs
    await registerWithAPNs();
    return true;
  } catch (error) {
    console.error('Error enabling push notifications:', error);
    return false;
  }
}

/**
 * Register with APNs to get device token
 */
async function registerWithAPNs(): Promise<void> {
  try {
    console.log('Registering with APNs...');
    await PushNotifications.register();
    console.log('APNs registration initiated');
  } catch (error) {
    console.error('Error registering with APNs:', error);
  }
}

/**
 * Set up listeners for push notification events
 */
async function setupPushNotificationListeners(): Promise<void> {
  if (listenersSetUp) {
    return;
  }

  try {
    // Remove any existing listeners first
    await PushNotifications.removeAllListeners();

    // Registration successful - token received
    await PushNotifications.addListener('registration', (token: Token) => {
      console.log('Push notification registration successful, token:', token.value);
      currentToken = token.value;
    });

    // Registration error
    await PushNotifications.addListener('registrationError', (error: RegistrationError) => {
      console.error('Push notification registration error:', error.error);
      registrationErrorCallbacks.forEach(callback => callback(new Error(error.error)));
    });

    // Notification received while app is in foreground
    await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      console.log('Push notification received in foreground:', notification);
      notificationReceivedCallbacks.forEach(callback => callback(notification));
    });

    // User tapped on notification
    await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      console.log('Push notification action performed:', action);
      notificationActionCallbacks.forEach(callback => callback(action));
    });

    listenersSetUp = true;
    console.log('Push notification listeners set up successfully');
  } catch (error) {
    console.error('Error setting up push notification listeners:', error);
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
      console.error('Failed to register device token:', errorData);
      return false;
    }

    console.log('Device token registered successfully');
    return true;
  } catch (error) {
    console.error('Error registering device token:', error);
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
      console.error('Failed to unregister device token:', errorData);
      return false;
    }

    console.log('Device token unregistered successfully');
    return true;
  } catch (error) {
    console.error('Error unregistering device token:', error);
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
      console.error('Failed to fetch push preferences:', errorData);
      return null;
    }

    const data = await response.json();
    return data.preferences;
  } catch (error) {
    console.error('Error fetching push preferences:', error);
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
      console.error('Failed to update push preferences:', errorData);
      return null;
    }

    const data = await response.json();
    return data.preferences;
  } catch (error) {
    console.error('Error updating push preferences:', error);
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
    console.error('Error getting delivered notifications:', error);
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
    console.error('Error removing delivered notifications:', error);
  }
}
