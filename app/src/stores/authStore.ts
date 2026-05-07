import type { AuthUser, UserDoc } from '@compass/shared-types';
import { create } from 'zustand';

type AuthState = {
  uid: string | null;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isLoading: boolean;
  /**
   * The user's Firestore profile doc, kept in sync via `subscribeUserDoc`.
   * `null` when signed out OR when the doc hasn't loaded yet (the
   * subscription fires asynchronously after sign-in). AuthGate's redirect
   * logic treats `null` as "not yet known" — it doesn't push to onboarding
   * until the doc is loaded.
   */
  userDoc: UserDoc | null;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setUserDoc: (doc: UserDoc | null) => void;
};

/**
 * Auth state singleton. Hydrated by `useAuthSubscription` from Firebase's
 * `onAuthStateChanged` callback. `isLoading` starts true and flips to false
 * after the first callback (regardless of authed/unauthed result) so the
 * `<AuthGate>` can render `<Splash>` until then.
 *
 * `userDoc` is populated separately by a Firestore subscription on
 * `users/{uid}` started after sign-in; the AuthGate uses it to drive the
 * onboardingComplete redirect and Dashboard reads it for the goal pill.
 */
export const useAuthStore = create<AuthState>((set) => ({
  uid: null,
  email: null,
  displayName: null,
  photoURL: null,
  isLoading: true,
  userDoc: null,
  setUser: (user) =>
    set({
      uid: user?.uid ?? null,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      photoURL: user?.photoURL ?? null,
      // Clear the user doc on sign-out so AuthGate doesn't make decisions
      // off stale data when a different user signs in next.
      ...(user === null ? { userDoc: null } : {}),
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setUserDoc: (userDoc) => set({ userDoc }),
}));

export const useIsAuthed = (): boolean => useAuthStore((s) => s.uid !== null);
export const useAuthLoading = (): boolean => useAuthStore((s) => s.isLoading);
export const useAuthUser = (): AuthUser | null =>
  useAuthStore((s) =>
    s.uid
      ? { uid: s.uid, email: s.email, displayName: s.displayName, photoURL: s.photoURL }
      : null,
  );
export const useUserDoc = (): UserDoc | null => useAuthStore((s) => s.userDoc);
