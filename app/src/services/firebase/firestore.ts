import type { UserDoc, WorkspaceDoc } from '@compass/shared-types';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

import { db } from './client';

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
  await batch.commit();

  return newUser;
}
