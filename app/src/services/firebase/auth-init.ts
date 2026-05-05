import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeAuth } from 'firebase/auth';
import type { Auth, Persistence } from 'firebase/auth';
import * as firebaseAuth from 'firebase/auth';

import { app } from './client-app';

/**
 * Native auth init. AsyncStorage backs Firebase's RN persistence so the
 * session survives Expo Go reloads + force-quits.
 *
 * Type note: `getReactNativePersistence` is exported at runtime by
 * `firebase/auth` when Metro resolves the `react-native` condition, but
 * TypeScript reads `auth-public.d.ts` which omits it (Firebase v12 surface
 * is web-first). We pull it off the namespace import via a typed cast so
 * the rest of the file stays strict.
 */
type GetReactNativePersistence = (storage: typeof AsyncStorage) => Persistence;
const getReactNativePersistence = (
  firebaseAuth as unknown as { getReactNativePersistence: GetReactNativePersistence }
).getReactNativePersistence;

export const firebaseAuthInstance: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Keep the original named export for client.ts.
export { firebaseAuthInstance as firebaseAuth };
