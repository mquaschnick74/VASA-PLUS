// Location: client/src/lib/capacitor-plugins.ts
// Capacitor plugin initialization and management

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';
import {
  initializePushNotifications,
  onNotificationReceived,
  onNotificationAction,
  handleNotificationDeepLink,
  type NotificationPayload
} from './push-notifications';

export const isNativePlatform = Capacitor.isNativePlatform();

// Store navigation function for deep linking
let navigateFunction: ((path: string) => void) | null = null;

/**
 * Set the navigation function for deep linking from notifications
 */
export function setNavigationHandler(navigate: (path: string) => void) {
  navigateFunction = navigate;
}

/**
 * Initialize all Capacitor plugins
 */
export async function initializeCapacitor() {
  if (!isNativePlatform) return;

  try {
    // Set status bar style for dark theme
    await StatusBar.setStyle({ style: Style.Dark });

    // Hide splash screen after app is ready
    await SplashScreen.hide();

    // Handle app URL open events (for deep linking)
    App.addListener('appUrlOpen', (event) => {
      console.log('App opened with URL:', event.url);
      handleDeepLink(event.url);
    });

    // Handle back button on Android (if you add Android later)
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      }
    });

    // Initialize push notifications
    await initializePushNotificationsWithHandlers();
  } catch (error) {
    console.error('Error initializing Capacitor plugins:', error);
  }
}

/**
 * Initialize push notifications with event handlers
 */
async function initializePushNotificationsWithHandlers() {
  try {
    // Initialize push notifications
    await initializePushNotifications();

    // Set up notification received handler (foreground notifications)
    onNotificationReceived((notification) => {
      console.log('Notification received in foreground:', notification.title);
      // Notification will be shown by the native OS
      // We can optionally handle custom UI here
    });

    // Set up notification action handler (when user taps notification)
    onNotificationAction((action) => {
      console.log('User tapped notification:', action.notification.title);

      // Extract payload from notification
      const payload = action.notification.data as NotificationPayload | undefined;

      if (payload) {
        // Get deep link path from payload
        const deepLinkPath = handleNotificationDeepLink(payload);

        if (deepLinkPath && navigateFunction) {
          // Navigate to the appropriate screen
          navigateFunction(deepLinkPath);
        }
      }
    });
  } catch (error) {
    console.error('Error initializing push notifications:', error);
  }
}

/**
 * Handle deep link URLs
 */
function handleDeepLink(url: string) {
  try {
    // Parse the URL
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname;

    // Navigate to the path if we have a navigation handler
    if (navigateFunction && path) {
      navigateFunction(path);
    }
  } catch (error) {
    console.error('Error handling deep link:', error);
  }
}

/**
 * Check if the app was launched from a notification
 * Should be called after app initialization to handle cold start notifications
 */
export async function checkLaunchNotification() {
  // This is handled automatically by the PushNotifications plugin
  // The pushNotificationActionPerformed event fires for cold starts too
  return null;
}
