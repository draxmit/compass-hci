import type { AuthUser } from '@compass/shared-types';
import { create } from 'zustand';

type AuthState = {
  uid: string | null;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
};

/**
 * Auth state singleton. Hydrated by `useAuthSubscription` from Firebase's
 * `onAuthStateChanged` callback. `isLoading` starts true and flips to false
 * after the first callback (regardless of authed/unauthed result) so the
 * `<AuthGate>` can render `<Splash>` until then.
 */
export const useAuthStore = create<AuthState>((set) => ({
  uid: null,
  email: null,
  displayName: null,
  photoURL: null,
  isLoading: true,
  setUser: (user) =>
    set({
      uid: user?.uid ?? null,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      photoURL: user?.photoURL ?? null,
    }),
  setLoading: (isLoading) => set({ isLoading }),
}));

export const useIsAuthed = (): boolean => useAuthStore((s) => s.uid !== null);
export const useAuthLoading = (): boolean => useAuthStore((s) => s.isLoading);
export const useAuthUser = (): AuthUser | null =>
  useAuthStore((s) =>
    s.uid
      ? { uid: s.uid, email: s.email, displayName: s.displayName, photoURL: s.photoURL }
      : null,
  );
