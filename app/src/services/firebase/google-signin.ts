import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useEffect, useState } from 'react';

import { auth } from './client';

// Required by expo-auth-session in Expo Go on Android — closes the browser
// session if it's still in flight on app focus.
WebBrowser.maybeCompleteAuthSession();

export type GoogleSignInResult =
  | { type: 'success' }
  | { type: 'error'; message: string }
  | { type: 'dismiss' };

export type UseGoogleSignIn = {
  promptAsync: () => Promise<GoogleSignInResult>;
  isPending: boolean;
};

/**
 * Native Google sign-in via expo-auth-session/providers/google. Works inside
 * Expo Go without a custom dev client. Returns the same hook shape as the
 * web variant so screens stay identical.
 *
 * The Android Client ID is empty until the SHA-1 fingerprint step lands
 * (see ADR-03 §11). Until then, Android prompts will fail with an
 * `invalid_client` error — surfaced to the user as { type: 'error' }.
 */
export function useGoogleSignIn(): UseGoogleSignIn {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID;

  // Build request config — only include keys whose value is non-empty so we
  // satisfy `exactOptionalPropertyTypes: true` (no explicit `undefined`).
  const requestConfig: Parameters<typeof Google.useAuthRequest>[0] = {};
  if (webClientId) requestConfig.webClientId = webClientId;
  if (androidClientId) requestConfig.androidClientId = androidClientId;

  const [request, response, promptHook] = Google.useAuthRequest(requestConfig);

  const [isPending, setIsPending] = useState(false);
  const [resolver, setResolver] = useState<((result: GoogleSignInResult) => void) | null>(null);

  useEffect(() => {
    if (!response || !resolver) return;
    (async () => {
      try {
        if (response.type === 'success') {
          const idToken = response.authentication?.idToken;
          if (!idToken) {
            resolver({ type: 'error', message: 'No ID token returned from Google.' });
            return;
          }
          const credential = GoogleAuthProvider.credential(idToken);
          await signInWithCredential(auth, credential);
          resolver({ type: 'success' });
        } else if (response.type === 'dismiss' || response.type === 'cancel') {
          resolver({ type: 'dismiss' });
        } else {
          const message =
            'error' in response && response.error ? response.error.message : 'Google sign-in failed.';
          resolver({ type: 'error', message });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Google sign-in failed.';
        resolver({ type: 'error', message });
      } finally {
        setIsPending(false);
        setResolver(null);
      }
    })();
  }, [response, resolver]);

  const promptAsync = async (): Promise<GoogleSignInResult> => {
    if (!request) {
      return { type: 'error', message: 'Google sign-in is not ready yet.' };
    }
    setIsPending(true);
    return new Promise<GoogleSignInResult>((resolve) => {
      setResolver(() => resolve);
      void promptHook();
    });
  };

  return { promptAsync, isPending };
}
