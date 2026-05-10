import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useEffect, useState } from 'react';

import { auth } from './client';

export type GoogleSignInResult =
  | { type: 'success' }
  | { type: 'error'; message: string }
  | { type: 'dismiss' };

export type UseGoogleSignIn = {
  promptAsync: () => Promise<GoogleSignInResult>;
  isPending: boolean;
};

/**
 * Native Google sign-in via @react-native-google-signin/google-signin.
 *
 * This is the SDK Google officially blesses for Android — it uses
 * Play Services' native account-picker modal instead of the in-app
 * browser + custom URI scheme dance that expo-auth-session does.
 *
 * Why we switched:
 *   The expo-auth-session/providers/google flow is officially
 *   deprecated and increasingly hostile to recent Google policy
 *   changes. We hit FIVE different gotchas trying to make it work:
 *   custom URI scheme disabled by default, scheme mismatch with
 *   Linking primary scheme, schemes order baked into native build,
 *   400 invalid_request on non-package-name schemes, and a silent
 *   credential-exchange failure. The official SDK sidesteps all of
 *   these by talking to Google Play Services directly — no browser
 *   round-trip, no URL parsing, no intent filter intricacies.
 *
 * Setup requirements (one-time):
 *   1. Web Client ID registered in Google Cloud Console (already done)
 *   2. Android Client ID with package name + SHA-1 (already done)
 *   3. SHA-1 added to Firebase Console (already done)
 *   4. The package's Expo plugin in app.config.ts (added in this commit)
 *   5. Rebuild the dev client APK to bake in the native module
 *
 * Sign-in flow:
 *   - GoogleSignin.configure({ webClientId }) — call once at module load
 *   - GoogleSignin.signIn() — opens native account picker
 *   - Returns idToken — exchange for Firebase credential
 *   - signInWithCredential(auth, credential) — completes Firebase auth
 *   - onAuthStateChanged in the auth store fires → AuthGate redirects
 */

// Configure once at module load. Web Client ID is the audience the
// returned id_token should target — Firebase Auth verifies this matches
// the Web Client ID it has configured for the Google provider. The
// Android Client ID is implicitly used by Play Services to actually
// authenticate the calling app (matched by package + SHA-1).
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID;
if (webClientId) {
  GoogleSignin.configure({
    webClientId,
    // We don't need extra scopes — basic profile + email come by default.
    // offlineAccess: true would give us a serverAuthCode for backend
    // token exchange, but we don't have a backend that needs it.
  });
}

export function useGoogleSignIn(): UseGoogleSignIn {
  const [isPending, setIsPending] = useState(false);

  // Defensive: if webClientId never resolved (env var missing in this
  // build), surface a clear error instead of silently failing.
  useEffect(() => {
    if (!webClientId) {
      console.warn('[google-signin] EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID is not set');
    }
  }, []);

  const promptAsync = async (): Promise<GoogleSignInResult> => {
    if (!webClientId) {
      return {
        type: 'error',
        message: 'Google sign-in is not configured (missing web client id).',
      };
    }
    setIsPending(true);
    try {
      // Ensure Play Services is available — Android-only check; iOS no-ops.
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();

      if (!isSuccessResponse(result)) {
        // User cancelled the picker.
        return { type: 'dismiss' };
      }

      const idToken = result.data.idToken;
      if (!idToken) {
        console.warn('[google-signin] no idToken in response', result);
        return { type: 'error', message: 'No ID token returned from Google.' };
      }

      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
      console.log('[google-signin] signInWithCredential ok');
      return { type: 'success' };
    } catch (err: unknown) {
      if (isErrorWithCode(err)) {
        // Map native error codes to user-readable messages.
        switch (err.code) {
          case statusCodes.SIGN_IN_CANCELLED:
            return { type: 'dismiss' };
          case statusCodes.IN_PROGRESS:
            return { type: 'error', message: 'Sign-in already in progress.' };
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            return { type: 'error', message: 'Google Play Services is not available on this device.' };
          default:
            return { type: 'error', message: `Google sign-in failed (${err.code}).` };
        }
      }
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      console.error('[google-signin] threw', err);
      return { type: 'error', message };
    } finally {
      setIsPending(false);
    }
  };

  return { promptAsync, isPending };
}
