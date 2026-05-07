import type { UserDoc, WorkspaceDoc } from '@compass/shared-types';
import type { User as FirebaseUser } from 'firebase/auth';
import { deleteUser } from 'firebase/auth';
import {
  collection, deleteDoc, doc, getDoc, getDocs, onSnapshot,
  serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore';

import { auth, db } from './client';
import { seedPresets } from '../firestore/categoriesService';

/**
 * Read a user document by uid. Returns `null` if it doesn't exist (e.g. on
 * very first sign-in before `ensureUserDoc` runs).
 */
export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as UserDoc;
}

/**
 * Idempotent first-sign-in side effect. Reads the user doc; if missing,
 * writes BOTH user + solo workspace docs in one Firestore batch.
 *
 * Defaults follow ADR-03 §9: Indonesian locale, system theme, IDR base
 * currency, monthly_limit budget style, biometric off, no fcm tokens, not
 * yet onboarded. The display name falls back to the email local part, then
 * to "User", so we always write a non-empty string.
 */
export async function ensureUserDoc(user: FirebaseUser): Promise<UserDoc> {
  const existing = await getUserDoc(user.uid);
  if (existing) return existing;

  const email = user.email ?? null;
  const fallbackFromEmail = email ? email.split('@')[0] : null;
  const displayName = user.displayName ?? fallbackFromEmail ?? 'User';
  const workspaceId = `solo-${user.uid}`;

  const newUser: UserDoc = {
    uid: user.uid,
    email,
    displayName,
    locale: 'id',
    theme: 'system',
    baseCurrency: 'IDR',
    budgetStyle: 'monthly_limit',
    biometricEnabled: false,
    fcmTokens: [],
    onboardingComplete: false,
    primaryGoal: null,            // T10 / ADR-11 — set by onboarding step 1
    createdAt: serverTimestamp(),
    defaultWorkspaceId: workspaceId,
    workspaceIds: [workspaceId],
  };

  const newWorkspace: WorkspaceDoc = {
    id: workspaceId,
    ownerId: user.uid,
    memberIds: [user.uid],
    name: 'Personal',
    createdAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'users', user.uid), newUser);
  batch.set(doc(db, 'workspaces', workspaceId), newWorkspace);
  // Seed Indonesian preset categories into the same batch so workspace +
  // categories land atomically (ADR-05 §2). ~45 docs; well under Firestore's
  // 500-write batch limit.
  seedPresets(batch, workspaceId);
  await batch.commit();

  return newUser;
}

/**
 * Realtime subscription to a user's profile doc. Used by the auth store
 * to keep `userDoc.onboardingComplete` + `primaryGoal` fresh in client
 * state, so AuthGate redirects + the Dashboard goal pill react to writes
 * from the onboarding wizard without refetching.
 */
export function subscribeUserDoc(
  uid: string,
  cb: (user: UserDoc | null) => void,
): () => void {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    cb(snap.exists() ? (snap.data() as UserDoc) : null);
  });
}

/**
 * Patch fields on the user doc. Used by the onboarding wizard to write
 * `primaryGoal`, `budgetStyle`, and `onboardingComplete` step-by-step,
 * by Settings to flip `biometricEnabled`, and by /profile inline-edit
 * for `primaryGoal` and `displayName`. Never overwrites the rest of the
 * doc — typed to the v1 mutable surface only.
 */
export async function updateUserDoc(
  uid: string,
  patch: Partial<
    Pick<
      UserDoc,
      | 'primaryGoal'
      | 'budgetStyle'
      | 'onboardingComplete'
      | 'displayName'
      | 'locale'
      | 'theme'
      | 'biometricEnabled'
      | 'displayInIDR'
    >
  >,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), patch);
}

/**
 * Order of subcollections wiped during account deletion. Order matters
 * only as defence-in-depth — Firestore enforces no referential
 * integrity, but if a step fails partway, leaving the user's `accounts`
 * around (deleted last) lets sign-back-in render a useful "your data is
 * partly gone" state instead of a wholly-orphaned shell. Per ADR-12 §3.
 */
const DELETION_SUBCOLLECTIONS = [
  'budgets',
  'category_month_totals',
  'transactions',
  'categories',
  'accounts',
] as const;

/**
 * Wipe a single subcollection in chunked batches. Firestore's batch
 * limit is 500 writes; we chunk at 400 for headroom. Sequential per
 * chunk to keep error surfaces obvious.
 */
async function wipeSubcollection(wid: string, name: string): Promise<void> {
  const ref = collection(db, 'workspaces', wid, name);
  const snap = await getDocs(ref);
  if (snap.empty) return;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}

/**
 * Client-side account deletion (T11 / ADR-12 §3). Wipes the entire
 * user subtree, then the user doc, then the Firebase Auth user. Order
 * is fixed: subcollections → workspace → user doc → Auth user.
 *
 * Throws on `auth/requires-recent-login`; callers should catch that
 * specific code and surface the friendly "sign in again" copy. Other
 * errors propagate as-is.
 *
 * AuthGate auto-redirects to /(auth)/sign-in once `auth.currentUser`
 * flips to null after `deleteUser` resolves — no manual nav needed.
 */
export async function deleteUserAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('deleteUserAccount: not signed in');
  const uid = user.uid;
  const wid = `solo-${uid}`;

  // Subcollections first.
  for (const name of DELETION_SUBCOLLECTIONS) {
    await wipeSubcollection(wid, name);
  }
  // Workspace doc.
  await deleteDoc(doc(db, 'workspaces', wid));
  // User doc.
  await deleteDoc(doc(db, 'users', uid));
  // Auth identity LAST. Throws auth/requires-recent-login if the
  // sign-in is stale; caller catches by error.code.
  await deleteUser(user);
}
