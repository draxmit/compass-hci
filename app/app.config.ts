import type { ExpoConfig } from 'expo/config';

// EXPO_PUBLIC_* env vars are inlined automatically by Metro at build time —
// no need to thread them through `extra`. See app/.env.local (gitignored).
const config: ExpoConfig = {
  name: 'Compass',
  slug: 'compass',
  version: '0.1.0',
  orientation: 'portrait',
  // App's deep-link scheme. Used by expo-router for typed routes,
  // notifications, share intents, etc. Google sign-in no longer
  // depends on URI schemes (we use @react-native-google-signin/
  // google-signin which talks to Play Services natively, no browser
  // round-trip and no redirect URI dance).
  scheme: 'compass',
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
    // Native Google Sign-in via Play Services. Required for the
    // @react-native-google-signin/google-signin module to wire its
    // native module at build time. Configure via the iOS URL scheme
    // for the iOS Client ID (we don't ship iOS native, so omitted).
    '@react-native-google-signin/google-signin',
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
