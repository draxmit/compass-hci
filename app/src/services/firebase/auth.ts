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
 * Update the current user's display name on both Firebase Auth (so future
 * sessions read the new name) and the Firestore user doc (so other clients
 * and queries stay consistent). Also pushes the change into the local auth
 * store immediately for instant UI feedback.
 */
export async function updateDisplayName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Display name cannot be empty');
  const current = auth.currentUser;
  if (!current) throw new Error('Not signed in');
  await updateProfile(current, { displayName: trimmed });
  // Mirror to Firestore user doc — non-fatal on failure.
  try {
    const { setDoc, doc } = await import('firebase/firestore');
    const { db } = await import('./client');
    await setDoc(
      doc(db, 'users', current.uid),
      { displayName: trimmed },
      { merge: true },
    );
  } catch (err) {
    console.warn('[firebase] updateDisplayName: firestore mirror failed', err);
  }
  // Push to local store immediately (avoids waiting for next onAuthStateChanged tick).
  useAuthStore.getState().setUser({
    uid: current.uid,
    email: current.email,
    displayName: trimmed,
    photoURL: current.photoURL,
  });
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
        const wid = `solo-${user.uid}`;
        ensureUserDoc(user)
          .then(() =>
            // Backfill seed for users created before T4 shipped — idempotent
            // (early-returns when categories already exist). New users have
            // them from the ensureUserDoc batch already; this catches the
            // gap.
            import('../firestore/categoriesService').then(({ ensureCategoriesSeeded }) =>
              ensureCategoriesSeeded(wid),
            ),
          )
          .then(() =>
            // Migrate any accounts that pre-date the integer-minor-units
            // storage shift. Idempotent via the _balanceUnitsV2 doc marker.
            import('../firestore/accountsService').then(({ migrateAccountBalancesToMinorUnits }) =>
              migrateAccountBalancesToMinorUnits(wid),
            ),
          )
          .catch((err: unknown) => {
            console.warn('[firebase] post-auth setup failed', err);
          });
      }
    });

    return unsubscribe;
  }, []);
}
