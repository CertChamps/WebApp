import type { CapacitorConfig } from '@capacitor/cli';

// Set by `npm run iPad` so the native shell loads the Vite LAN URL.
// Leave unset for TestFlight / App Store so the app uses bundled `webDir`.
const liveUrl = process.env.CAPACITOR_LIVE_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.certchamps.app',
  appName: 'CertChamps',
  webDir: '../dist',
  ...(liveUrl
    ? {
        server: {
          url: liveUrl,
          cleartext: true,
        },
      }
    : {}),
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
