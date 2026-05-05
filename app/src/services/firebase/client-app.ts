import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';

/**
 * Firebase web SDK app singleton. Cross-platform (web + RN). The native auth
 * adapter (`auth-init.native.ts`) attaches AsyncStorage persistence on top of
 * this app instance; the web adapter (`auth-init.web.ts`) attaches IndexedDB.
 *
 * `getApps().length` guard prevents `duplicate-app` errors during HMR /
 * React 19 Strict Mode double-mount.
 */
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);
