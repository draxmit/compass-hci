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
  splash: {
    backgroundColor: '#000000',
    resizeMode: 'contain',
  },
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
  plugins: ['expo-router', 'expo-font', 'expo-localization'],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
