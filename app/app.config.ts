import type { ExpoConfig } from 'expo/config';

// EXPO_PUBLIC_* env vars are inlined automatically by Metro at build time —
// no need to thread them through `extra`. See app/.env.local (gitignored).
const config: ExpoConfig = {
  name: 'Compass',
  slug: 'compass',
  version: '0.1.0',
  orientation: 'portrait',
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
    // SDK-54 splash screen replacement for the legacy `splash` field.
    // No image — just a solid black background while the bundle loads.
    [
      'expo-splash-screen',
      {
        backgroundColor: '#000000',
        resizeMode: 'contain',
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
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: '535d6e5a-41ec-41fb-a57f-f25802df6913',
    },
  },
};

export default config;
