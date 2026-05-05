// Shared types across the Compass monorepo.
// Populated by T2 (Auth + Firestore) and T6 (Transaction, Category).

/**
 * Per-user profile document.
 * Path: `users/{uid}`. Owner-only access (Firestore rules).
 *
 * `createdAt` is a Firestore server timestamp; on read it's a `Timestamp`,
 * but consumers don't need to import that here — code that parses dates
 * imports it from `firebase/firestore` directly. We type it as `unknown`
 * to keep the shared package free of firebase imports.
 */
export type UserDoc = {
  uid: string;
  email: string | null;
  displayName: string;
  locale: 'id' | 'en';
  theme: 'light' | 'dark' | 'system';
  baseCurrency: 'IDR' | 'USD';
  budgetStyle: 'monthly_limit' | 'envelope';
  biometricEnabled: boolean;
  fcmTokens: string[];
  onboardingComplete: boolean;
  createdAt: unknown;
  defaultWorkspaceId: string;
  workspaceIds: string[];
};

/**
 * Workspace doc — solo workspace per user in v1, future-proofed for shared
 * workspaces in v2.
 * Path: `workspaces/{wid}`. Solo workspace id is `solo-{uid}`.
 */
export type WorkspaceDoc = {
  id: string;
  ownerId: string;
  memberIds: string[];
  name: string;
  createdAt: unknown;
};

/**
 * Auth user view stored in client state. Mirror of the subset of the
 * `firebase/auth` `User` we expose to UI code, decoupled from the SDK type.
 */
export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

// TODO(T6): export Transaction, Category, Split types
