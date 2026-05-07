import type { UserDoc, WorkspaceDoc } from '@compass/shared-types';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';

import { db } from './client';
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
 * `primaryGoal`, `budgetStyle`, and `onboardingComplete` step-by-step
 * without overwriting the rest of the doc.
 */
export async function updateUserDoc(
  uid: string,
  patch: Partial<Pick<UserDoc, 'primaryGoal' | 'budgetStyle' | 'onboardingComplete' | 'displayName' | 'locale' | 'theme'>>,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), patch);
}
