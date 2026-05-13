import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.certchamps.app',
  appName: 'CertChamps',
  webDir: '../dist',
  plugins: {
    App: {
      disableBackButtonHandler: true,
    },
    // @capgo/capacitor-social-login — bundle only Google to keep IPA small.
    // The actual iOSClientId / webClientId are passed at runtime via
    // SocialLogin.initialize() in src/lib/nativeGoogleLogin.ts.
    SocialLogin: {
      providers: {
        google: true,
        apple: false,
        facebook: false,
        twitter: false,
      },
    },
  },
};

export default config;
