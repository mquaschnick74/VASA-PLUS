import { Capacitor } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();
export const isIOS = Capacitor.getPlatform() === 'ios';
export const isAndroid = Capacitor.getPlatform() === 'android';
export const isWeb = !isNativeApp;
