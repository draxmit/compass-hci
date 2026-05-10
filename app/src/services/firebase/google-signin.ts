import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { auth } from './client';

// Required by expo-auth-session — closes the in-app browser session if
// it's still in flight on app focus. Must run at module load (not inside
// the hook) so the side-effect registers BEFORE any auth attempt.
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
 * Native Google sign-in via expo-auth-session/providers/google.
 *
 * v3 update: handle the Firebase credential exchange in the useEffect
 * watching `response` directly, NOT inside a promise wrapper. The
 * earlier wrapper held the resolve callback in component state — if
 * Android remounted the sign-in screen during the in-app browser
 * (common with low-memory devices), the resolver was lost and the
 * useEffect short-circuited at `if (!resolver) return`. Result was
 * "browser closes, app foregrounds, user is back on the sign-in
 * screen with no error and no signed-in session" — exactly the
 * symptom we hit on the dev client.
 *
 * The new flow: the useEffect ALWAYS handles a successful response by
 * calling signInWithCredential — Firebase Auth's `onAuthStateChanged`
 * listener (wired in the auth store) propagates the signed-in user
 * to AuthGate which redirects to /tabs. The promise from promptAsync
 * still resolves for callers that want to surface errors locally,
 * but the actual sign-in side-effect doesn't depend on that promise
 * surviving a remount.
 *
 * Diagnostic logs emit to Metro / console so a dev can see exactly
 * which step fails when debugging the OAuth round-trip.
 */
export function useGoogleSignIn(): UseGoogleSignIn {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID;

  // Build request config — only include keys whose value is non-empty so we
  // satisfy `exactOptionalPropertyTypes: true` (no explicit `undefined`).
  const requestConfig: Parameters<typeof Google.useAuthRequest>[0] = {};
  if (webClientId) requestConfig.webClientId = webClientId;
  if (androidClientId) requestConfig.androidClientId = androidClientId;
  // Override the redirect URI on Android. By default expo-auth-session uses
  // `${applicationId}:/oauthredirect` = `com.compass.app:/oauthredirect`, BUT
  // Linking (which expo-auth-session uses to parse incoming URLs) is
  // configured with `compass` as the primary scheme — so URLs starting with
  // `com.compass.app:` get ignored by the URL listener, even though Android
  // delivers them. Telling Google to redirect to `compass:/oauthredirect`
  // matches Linking's default scheme so the URL parses correctly and the
  // listener fires. Google's Android OAuth client accepts custom URI
  // schemes other than the package name (Custom URI Scheme toggle is on),
  // and the SHA-1 + package validation still proves we're the right app.
  if (Platform.OS === 'android') {
    requestConfig.redirectUri = 'compass:/oauthredirect';
  }

  const [request, response, promptHook] = Google.useAuthRequest(requestConfig);

  const [isPending, setIsPending] = useState(false);
  // Resolver lives in a ref, not state — survives a remount IF the
  // hook instance is the same. Plus we no longer depend on it for the
  // actual sign-in side-effect (the useEffect below runs regardless),
  // so a lost resolver no longer means a lost sign-in.
  const resolverRef = useRef<((result: GoogleSignInResult) => void) | null>(null);

  // Process every response that arrives from useAuthRequest. Runs on
  // every response state change including re-mounts (since the hook is
  // wired fresh and Linking re-delivers any pending auth result).
  useEffect(() => {
    if (!response) return;
    void (async () => {
      console.log('[google-signin] response received:', response.type);

      try {
        if (response.type === 'success') {
          const idToken = response.authentication?.idToken;
          const accessToken = response.authentication?.accessToken;
          console.log('[google-signin] success — idToken present:', !!idToken,
            'accessToken present:', !!accessToken);

          if (!idToken) {
            // Auto-code-exchange may not have populated id_token if the
            // OAuth client config returned only an access token. Try to
            // fall back to access-token-only credential (Firebase accepts
            // either when the audience matches).
            if (accessToken) {
              console.log('[google-signin] no idToken, trying accessToken credential');
              const credential = GoogleAuthProvider.credential(null, accessToken);
              await signInWithCredential(auth, credential);
              console.log('[google-signin] signInWithCredential ok (accessToken)');
              resolverRef.current?.({ type: 'success' });
            } else {
              console.warn('[google-signin] no idToken AND no accessToken in response',
                JSON.stringify(response.authentication));
              resolverRef.current?.({
                type: 'error',
                message: 'No ID token or access token returned from Google.',
              });
            }
          } else {
            const credential = GoogleAuthProvider.credential(idToken, accessToken);
            await signInWithCredential(auth, credential);
            console.log('[google-signin] signInWithCredential ok (idToken)');
            resolverRef.current?.({ type: 'success' });
          }
        } else if (response.type === 'dismiss' || response.type === 'cancel') {
          console.log('[google-signin] user dismissed');
          resolverRef.current?.({ type: 'dismiss' });
        } else {
          const message =
            'error' in response && response.error
              ? response.error.message
              : 'Google sign-in failed.';
          console.warn('[google-signin] non-success response:', message, response);
          resolverRef.current?.({ type: 'error', message });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Google sign-in failed.';
        console.error('[google-signin] threw during credential exchange:', err);
        resolverRef.current?.({ type: 'error', message });
      } finally {
        setIsPending(false);
        resolverRef.current = null;
      }
    })();
  }, [response]);

  const promptAsync = async (): Promise<GoogleSignInResult> => {
    if (!request) {
      console.warn('[google-signin] promptAsync called before request was ready');
      return { type: 'error', message: 'Google sign-in is not ready yet.' };
    }
    setIsPending(true);
    return new Promise<GoogleSignInResult>((resolve) => {
      resolverRef.current = resolve;
      void promptHook();
    });
  };

  return { promptAsync, isPending };
}
