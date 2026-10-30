import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Placeholder: must match the App ID registered in the Apple Developer account before signing.
  appId: 'dev.telos.holdemmathlab',
  appName: "Hold'em Math Lab",
  webDir: 'dist',
  backgroundColor: '#0b1512',
  ios: {
    // Let the page handle safe areas itself (it uses env(safe-area-inset-*)).
    contentInset: 'never',
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0b1512',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
