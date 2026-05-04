import type { ExpoConfig } from 'expo/config';

// TODO(T2): wire EXPO_PUBLIC_FIREBASE_* env into extra
// TODO(T2): add googleServicesFile pointing at app/google-services.json
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
    adaptiveIcon: {
      backgroundColor: '#000000',
    },
    package: 'com.compass.app',
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
