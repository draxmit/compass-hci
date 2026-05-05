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

/**
 * Bilingual name shape used for category docs (and future budget / goal docs).
 * Mirrors the i18n locale shape so renderers do `name[i18n.language]` directly.
 * For user-created categories where the user only types one string, both keys
 * hold the same string.
 */
export type CategoryName = { id: string; en: string };

/**
 * Curated Lucide icon keys — string-literal union restricts what may be stored
 * on a Category doc. Resolution to a Lucide React component happens at render
 * time via `<CategoryIcon name={...}/>`.
 */
export type CategoryIcon =
  | 'utensils' | 'coffee' | 'shopping-cart' | 'pizza' | 'cookie'
  | 'car' | 'fuel' | 'train' | 'bike' | 'parking-circle'
  | 'zap' | 'droplet' | 'wifi' | 'phone' | 'tv' | 'heart-pulse'
  | 'shirt' | 'tv-2' | 'home' | 'sparkles'
  | 'film' | 'gamepad-2' | 'music' | 'plane'
  | 'stethoscope' | 'pill' | 'dumbbell'
  | 'book-open' | 'graduation-cap'
  | 'wallet' | 'gift' | 'briefcase' | 'trending-up'
  | 'coins' | 'landmark' | 'tag';

/**
 * Curated colour-key palette for categories. Resolution to hex (per
 * light/dark mode) happens at render time via the categoryColors map.
 */
export type CategoryColor =
  | 'red' | 'orange' | 'amber' | 'yellow'
  | 'green' | 'teal' | 'cyan' | 'blue'
  | 'indigo' | 'violet' | 'pink' | 'slate';

/**
 * Category document.
 * Path: `workspaces/{wid}/categories/{categoryId}`.
 *
 * Two-level hierarchy: `parentId === null` is a top-level group;
 * `parentId !== null` is a child of that group.
 *
 * Preset rows are seeded from `categoryPresets.ts` in the same batch as
 * `ensureUserDoc` (ADR-05 §2). Custom user rows are created via
 * `createCategory` from the /categories screen.
 *
 * Soft delete: `isArchived = true` hides from the default view but preserves
 * the doc id so transactions retain a stable reference.
 */
export type Category = {
  id: string;
  parentId: string | null;
  name: CategoryName;
  icon: CategoryIcon;
  color: CategoryColor;
  isPreset: boolean;
  isArchived: boolean;
  order: number;
  createdAt: unknown;
};

// TODO(T6): export Transaction, Split types
