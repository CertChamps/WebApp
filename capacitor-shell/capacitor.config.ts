import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.certchamps.app',
  appName: 'CertChamps',
  webDir: '../dist',
  plugins: {
    App: {
      disableBackButtonHandler: true,
    },
  },
};

export default config;
