import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';

export const isNativePlatform = Capacitor.isNativePlatform();

export async function initializeCapacitor() {
  if (!isNativePlatform) return;

  // Set status bar style for dark theme
  await StatusBar.setStyle({ style: Style.Dark });

  // Hide splash screen after app is ready
  await SplashScreen.hide();

  // Handle app URL open events (for deep linking later)
  App.addListener('appUrlOpen', (event) => {
    console.log('App opened with URL:', event.url);
    // Handle deep links here if needed
  });

  // Handle back button on Android (if you add Android later)
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    }
  });
}
