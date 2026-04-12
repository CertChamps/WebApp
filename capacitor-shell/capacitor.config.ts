import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.certchamps.app',
  appName: 'CertChamps',
  webDir: 'www',
  server: {
    url: 'https://app.certchamps.ie',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      'app.certchamps.ie',
      'storage.googleapis.com',
      '*.storage.googleapis.com',
      '*.googleapis.com',
    ],
  },
  plugins: {
    App: {
      disableBackButtonHandler: true,
    },
  },
};

export default config;
