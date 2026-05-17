import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.certchamps.app',
  appName: 'CertChamps',
  webDir: '../dist',
  plugins: {
    App: {
      disableBackButtonHandler: true,
    },
    // @capgo/capacitor-social-login — bundle Google + Apple. Provider runtime
    // config is passed via SocialLogin.initialize() in
    // src/lib/nativeGoogleLogin.ts and src/lib/nativeAppleLogin.ts.
    //
    // NOTE: enabling `apple: true` makes the plugin link Alamofire (used by
    // its Apple provider). The "Sign In With Apple" capability also needs to
    // be present in App.entitlements / Apple Developer portal for the App ID.
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },
  },
};

export default config;
