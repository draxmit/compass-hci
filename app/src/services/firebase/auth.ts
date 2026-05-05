import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { useEffect } from 'react';

import { useAuthStore } from '@/stores/authStore';

import { auth } from './client';
import { ensureUserDoc } from './firestore';
import { useGoogleSignIn } from './google-signin';

/**
 * Cross-platform auth helpers + the auth state subscription hook. The
 * `useGoogleSignIn` hook is platform-forked via `./google-signin` →
 * `google-signin.web.ts` (popup) or `google-signin.ts` (expo-auth-session).
 */

export type { GoogleSignInResult, UseGoogleSignIn } from './google-signin';
export { useGoogleSignIn };

/**
 * Sign in with email + password. Throws on Firebase error so screens can
 * branch on `error.code` to render localized messages.
 */
export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/**
 * Sign up with email + password and set the display name on the Auth user.
 * The Firestore user doc is created later inside `useAuthSubscription` →
 * `ensureUserDoc`.
 */
export async function signUpWithEmailPassword(
  email: string,
  password: string,
  displayName: string,
): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential.user;
}

/**
 * Send a password reset email. We DON'T differentiate "user not found" vs
 * other errors — screens always show a generic success message to avoid
 * email enumeration (ADR-03 §6).
 */
export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Sign out. Clears the Firebase session; `onAuthStateChanged` then null-flips
 * the store, which the `<AuthGate>` reacts to with a redirect to (auth).
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Subscribe to Firebase auth state, mirroring it into Zustand and calling
 * `ensureUserDoc` on first sign-in. The unsubscribe is returned from the
 * effect cleanup so React 19 Strict Mode (or HMR) re-subscriptions don't
 * leak listeners.
 *
 * Firestore `ensureUserDoc` failures are caught + logged but never block
 * auth state — the user can still navigate; the doc will be created the
 * next time the subscription fires.
 */
export function useAuthSubscription(): void {
  useEffect(() => {
    const setUser = useAuthStore.getState().setUser;
    const setLoading = useAuthStore.getState().setLoading;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(
        user
          ? {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
            }
          : null,
      );
      setLoading(false);

      if (user) {
        ensureUserDoc(user).catch((err: unknown) => {
          console.warn('[firebase] ensureUserDoc failed', err);
        });
      }
    });

    return unsubscribe;
  }, []);
}
