import {
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { useState } from 'react';

import { auth } from './client';

/**
 * Web Google sign-in via popup. Returns a stable hook shape — `promptAsync`
 * resolves with `{ type: 'success' | 'error' | 'dismiss' }` so screens can
 * branch identically across platforms. `isPending` lets buttons disable
 * during the popup roundtrip.
 */
export type GoogleSignInResult =
  | { type: 'success' }
  | { type: 'error'; message: string }
  | { type: 'dismiss' };

export type UseGoogleSignIn = {
  promptAsync: () => Promise<GoogleSignInResult>;
  isPending: boolean;
};

export function useGoogleSignIn(): UseGoogleSignIn {
  const [isPending, setIsPending] = useState(false);

  const promptAsync = async (): Promise<GoogleSignInResult> => {
    setIsPending(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      return { type: 'success' };
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return { type: 'dismiss' };
      }
      const message = err instanceof Error ? err.message : 'Google sign-in failed.';
      return { type: 'error', message };
    } finally {
      setIsPending(false);
    }
  };

  return { promptAsync, isPending };
}
