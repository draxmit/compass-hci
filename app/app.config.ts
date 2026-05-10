import type { ExpoConfig } from 'expo/config';

// EXPO_PUBLIC_* env vars are inlined automatically by Metro at build time —
// no need to thread them through `extra`. See app/.env.local (gitignored).
const config: ExpoConfig = {
  name: 'Compass',
  slug: 'compass',
  version: '0.1.0',
  orientation: 'portrait',
  // Two schemes — ORDER MATTERS:
  //  - 'com.compass.app' → PRIMARY scheme. Required by Google OAuth on
  //                        Android (Custom URI Scheme registered with
  //                        the Android OAuth Client ID must match the
  //                        package name). expo-auth-session sends the
  //                        OAuth request with redirect_uri=<this>:/
  //                        oauthredirect, and the response URL must
  //                        match expo-linking's PRIMARY scheme for the
  //                        URL listener to recognise it as a callback.
  //  - 'compass'         → app's own deep links (notifications, share
  //                        intents, etc.). Kept for backward-compat
  //                        with anything using compass:// schema —
  //                        but no source-code references currently
  //                        hardcode it (verified via grep).
  // Both schemes are registered as Android intent filters at native build
  // time. Reordering may require `eas build --profile development` if
  // the order is baked into the AndroidManifest at build time; try a
  // Metro reload first and rebuild only if Linking still picks the
  // wrong primary scheme.
  scheme: ['com.compass.app', 'compass'],
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  // The legacy top-level `splash` field is deprecated in SDK 54 and
  // tries to wire `drawable/splashscreen_logo` even without an image
  // present, which fails the Android build with
  //   error: resource drawable/splashscreen_logo not found
  // SDK-54 way is the `expo-splash-screen` plugin in `plugins` below.
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.compass.app',
  },
  android: {
    package: 'com.compass.app',
    adaptiveIcon: {
      backgroundColor: '#000000',
    },
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  web: {
    bundler: 'metro',
    output: 'static',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-localization',
    // SDK-54 splash screen replacement for the legacy `splash` field.
    // The plugin generates `drawable/splashscreen_logo` regardless of
    // config — even when `image` is omitted — so we MUST point it at
    // a real PNG that exists on disk, otherwise Android resource
    // linking fails. `assets/splash-icon.png` is a 200×200 brand-
    // emerald square with a small white centre dot generated at
    // build-config time.
    [
      'expo-splash-screen',
      {
        backgroundColor: '#000000',
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        imageWidth: 200,
      },
    ],
    // Camera — used by receipt OCR (snap a photo → ML Kit reads the
    // amount/merchant). Permission strings are shown in the OS prompt.
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Compass to use the camera to scan receipts.',
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    // Speech recognition — drives voice input on /transaction/new.
    // Wraps SiriKit on iOS, Google Speech Service on Android.
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Allow Compass to use the microphone for voice input.',
        speechRecognitionPermission: 'Allow Compass to recognize speech for voice input.',
        androidSpeechServicePackages: ['com.google.android.googlequicksearchbox'],
      },
    ],
    // Local notifications — daily logging reminders, budget alerts,
    // and goal deadline reminders (ADR-24). We DON'T set up FCM /
    // APNs push — all reminders are scheduled on-device via the
    // platform's local notification API. Cross-device sync is
    // unnecessary because the underlying state (budget %, tx history,
    // goal targets) syncs via Firestore and the scheduler runs on
    // each device independently.
    'expo-notifications',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: '535d6e5a-41ec-41fb-a57f-f25802df6913',
    },
    /**
     * URL of the deployed Cloudflare Worker that proxies chat requests
     * to Gemini (ADR-23 / packages/gemini-worker). Empty until the
     * Worker is deployed for the first time — the chat screen renders
     * a "not configured" view in that case.
     *
     * After running `wrangler deploy` in `packages/gemini-worker/`,
     * paste the returned URL here, e.g.:
     *   geminiWorkerUrl: 'https://compass-gemini.<sub>.workers.dev'
     */
    geminiWorkerUrl: process.env.EXPO_PUBLIC_GEMINI_WORKER_URL ?? '',
  },
};

export default config;
