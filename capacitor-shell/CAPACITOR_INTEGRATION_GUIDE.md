# Capacitor Integration Guide (CertChamps)

This guide is tailored for:
- App Name: `CertChamps`
- App ID: `com.certchamps.app`
- Live URL: `https://app.certchamps.ie`
- Platforms: iPad + Android tablets
- Shell mode: Capacitor loads live URL (no local web build)

## 1) Preflight (do this first)

### Windows checks
Run:

```powershell
node -v
npm -v
java -version
adb version
```

Expected:
- Node: modern LTS (your machine is OK)
- Java: **17+ required** (your machine currently has Java 8 and must be upgraded)
- `adb` must be available on PATH

Common failure:
- `Dependency requires at least JVM runtime version 11. This build uses a Java 8 JVM.`
Fix:
1. Install JDK 17
2. Set `JAVA_HOME` to JDK 17 path
3. Add `%JAVA_HOME%\bin` to PATH
4. Restart terminal and rerun `java -version`

### Android Studio components
In Android Studio > SDK Manager, install:
- Android SDK Platform (latest stable)
- Android SDK Build-Tools
- Android SDK Platform-Tools
- Android SDK Command-line Tools

## 2) Project structure and init (already done)

Shell wrapper lives in:
- `capacitor-shell/`

Key files:
- `capacitor-shell/capacitor.config.ts`
- `capacitor-shell/www/index.html` (placeholder fallback only)
- `capacitor-shell/android/`
- `capacitor-shell/ios/`

## 3) Capacitor config for external live URL

Current config in `capacitor-shell/capacitor.config.ts`:
- `appId: "com.certchamps.app"`
- `appName: "CertChamps"`
- `webDir: "www"`
- `server.url: "https://app.certchamps.ie"`
- `server.cleartext: false`
- `server.androidScheme: "https"`
- `server.allowNavigation` includes app + Google storage hosts

Important:
- Keep `cleartext: false` for production.
- Keep `allowNavigation` narrow.

## 4) GCS CORS for Capacitor origins (PDF support)

Updated repo CORS file:
- `storage-cors.json`

Includes origins:
- `https://app.certchamps.ie`
- `capacitor://localhost` (iOS shell origin)
- `http://localhost`
- `https://localhost`

Apply CORS:

```bash
gcloud config set project certchamps-a7527
gcloud storage buckets update gs://certchamps-a7527.firebasestorage.app --cors-file=storage-cors.json
```

If bucket name differs, use your active bucket.

Common CORS failures:
- Using `storage.cloud.google.com` links (auth endpoint, not CORS friendly)
- Missing `Origin` in bucket policy
- Calling one endpoint style while testing another

Use object URLs on:
- `https://storage.googleapis.com/...` or `https://<bucket>.storage.googleapis.com/...`

## 5) Android build and sideload

From `capacitor-shell/`:

```powershell
npm install
npm run sync:android
npm run android:debug
```

APK path:
- `capacitor-shell/android/app/build/outputs/apk/debug/app-debug.apk`

Install to tablet:

```powershell
adb devices
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Enable Developer Mode on Android tablet:
1. Open Settings > About tablet
2. Tap Build Number 7 times
3. Open Developer options
4. Enable USB debugging

If `adb` not found:
- Add Android platform-tools folder to PATH

## 6) iOS build on MacInCloud

### What you need
- Apple Developer Program membership
- App Store Connect access
- A MacInCloud plan with Xcode + internet access

### Transfer project from Windows to Mac
Option A: Git clone on Mac  
Option B: Zip `capacitor-shell` and upload with SCP/SFTP

### On Mac terminal

```bash
cd /path/to/capacitor-shell
npm install
npx cap sync ios
```

### In Xcode
1. Open `ios/App/App.xcworkspace`
2. Select target `App`
3. Signing & Capabilities:
   - Team: your Apple team
   - Bundle Identifier: `com.certchamps.app`
   - Signing: Automatic (recommended first)
4. Choose iPad device and Run

### TestFlight path
1. Product > Archive
2. Organizer opens
3. Validate App
4. Distribute App > App Store Connect > Upload
5. Assign build in TestFlight

Common iOS blockers:
- No signing certificate/profile
- Wrong bundle id in Apple portal
- Outdated Xcode command line tools
- CocoaPods issues (if plugin setup introduces pods later)

## 7) Canvas compatibility on tablets

Already implemented in web app:
- Drawing canvas uses Pointer Events + touch prevention
- `touch-action: none` for drawing areas
- iOS bounce/overscroll reduction in CSS

Added native handling:
- `src/App.tsx` sets a native-only viewport mode to reduce accidental zoom
- iOS native bridge controller disables back/forward swipe gestures:
  - `capacitor-shell/ios/App/App/ViewController.swift`
  - `capacitor-shell/ios/App/App/Base.lproj/Main.storyboard`

## 8) PDF handling approach

Current best path:
- Keep rendering with `pdf.js` in web layer for consistent UI
- Keep CDN/worker CORS out of the path (already using bundled worker)

Added optional native networking helper:
- `src/utils/nativeHttp.ts`

Use this when browser CORS still blocks a PDF endpoint you cannot change:
- `nativeHttpRequest(...)`
- `fetchPdfBytes(...)`

## 9) Splash screen and icon generation

1. Put source images in:
   - `capacitor-shell/assets/`
2. Run:

```powershell
cd capacitor-shell
npm run assets:generate
```

3. Sync projects:

```powershell
npm run sync
```

## 10) Android back behavior

Implemented in web layer:
- `src/App.tsx`
- Native back button now goes back in history when possible, otherwise minimizes/exits app.

## 11) iOS swipe-back behavior

Implemented:
- Native webview now explicitly keeps swipe navigation disabled to avoid interfering with canvas/PDF interactions.

## 12) Permissions (minimal + practical)

### Android
In `capacitor-shell/android/app/src/main/AndroidManifest.xml`:
- `INTERNET` is already present

Add more only if required by features:
- Files picker/share flows: usually no broad storage permission required (use SAF/content URIs)
- Camera/photo flows: add only when those features are implemented

### iOS
In `capacitor-shell/ios/App/App/Info.plist`, add usage strings only when used:
- `NSCameraUsageDescription` (camera)
- `NSPhotoLibraryUsageDescription` (pick photo/file from Photos)
- `NSPhotoLibraryAddUsageDescription` (save to Photos)

Do not add unnecessary permissions; store review risk increases.

## 13) App Store + Play pre-submission checklist

Use this before submission:
- App launches fast on real tablet hardware
- No blank screen when offline (fallback handling visible)
- Back navigation works naturally on Android
- iOS gestures do not break drawing or PDF interaction
- PDF loading tested on both Wi-Fi and poor network
- Canvas writing tested with finger + stylus
- Branded icon/splash generated and verified
- Privacy policy and support URLs prepared
- iPad screenshots + Android tablet screenshots prepared
- App review notes explain educational functionality and native value

Guideline 4.2.2 mitigation:
- Make sure native shell provides clear tablet UX polish (not generic wrapper feel):
  - polished startup/branding
  - reliable touch + navigation behavior
  - graceful offline/error states
  - tablet-optimized layouts and interactions
