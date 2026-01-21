import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.ivasa.app',
  appName: 'VASA-Plus',
  webDir: 'dist/public',
  server: {
    // For development, you can use your live server
    // Remove or comment this out for production builds
    // url: 'https://beta.ivasa.ai',
    // cleartext: true
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'VASA-Plus'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a'
    }
  }
};

export default config;
