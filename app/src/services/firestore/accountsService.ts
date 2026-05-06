import type {
  Account, AccountSubtype, AccountType, CategoryColor, CategoryIcon,
} from '@compass/shared-types';
import {
  collection, doc, getDocs, increment, onSnapshot,
  serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore';

import { db } from '../firebase/client';

function accountsCollection(wid: string) {
  return collection(db, 'workspaces', wid, 'accounts');
}
function accountRef(wid: string, id: string) {
  return doc(db, 'workspaces', wid, 'accounts', id);
}

export type CreateAccountInput = {
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  initialBalance: number;
  includedInNetWorth: boolean;
  icon: CategoryIcon;
  color: CategoryColor;
};

/**
 * Patch shape — explicitly excludes `currentBalance`, `initialBalance`,
 * and `id`. Balance mutations flow through `setBalance` / `adjustBalance`
 * only (ADR-06 §3); a defensive runtime guard inside `updateAccount`
 * backs this up.
 */
export type UpdateAccountInput = Partial<
  Omit<CreateAccountInput, 'initialBalance'>
>;

/**
 * One-shot read. Filter + sort client-side (same rationale as
 * categoriesService — avoids the where()+orderBy() composite index).
 */
export async function listAccounts(wid: string): Promise<Account[]> {
  const snap = await getDocs(accountsCollection(wid));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<Account, 'id'>), id: d.id }))
    .filter((a) => !a.isArchived)
    .sort((a, b) => a.order - b.order);
}

/**
 * Realtime subscription used by the /accounts screen.
 */
export function subscribeAccounts(
  wid: string,
  cb: (accounts: Account[]) => void,
): () => void {
  return onSnapshot(accountsCollection(wid), (snap) => {
    const list = snap.docs
      .map((d) => ({ ...(d.data() as Omit<Account, 'id'>), id: d.id }))
      .filter((a) => !a.isArchived)
      .sort((a, b) => a.order - b.order);
    cb(list);
  });
}

/**
 * Create a new account. Both `initialBalance` and `currentBalance` are
 * set to the user-entered value at creation time. `order` is set to
 * (max existing order across all accounts in this workspace) + 1.
 */
export async function createAccount(wid: string, input: CreateAccountInput): Promise<string> {
  const ref = doc(accountsCollection(wid));
  const all = await getDocs(accountsCollection(wid));
  const nextOrder = all.docs.reduce((max, d) => {
    const o = (d.data() as Account).order;
    return typeof o === 'number' && o > max ? o : max;
  }, -1) + 1;

  await writeBatch(db)
    .set(ref, {
      name: input.name,
      type: input.type,
      subtype: input.subtype,
      currency: 'IDR',
      currentBalance: input.initialBalance,
      initialBalance: input.initialBalance,
      includedInNetWorth: input.includedInNetWorth,
      isArchived: false,
      icon: input.icon,
      color: input.color,
      order: nextOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    .commit();
  return ref.id;
}

/**
 * Patch metadata (name, type, subtype, icon, colour, includedInNetWorth).
 * Refuses to touch `currentBalance` or `initialBalance` — those flow
 * through `setBalance` / `adjustBalance` only.
 */
export async function updateAccount(
  wid: string,
  id: string,
  patch: UpdateAccountInput,
): Promise<void> {
  // Defensive runtime guard — TypeScript already excludes these fields,
  // but keeping the runtime check protects the invariant if someone
  // bypasses the type via `as`.
  if ('currentBalance' in patch || 'initialBalance' in patch) {
    throw new Error('updateAccount: balance fields must flow through setBalance/adjustBalance');
  }
  await updateDoc(accountRef(wid, id), { ...patch, updatedAt: serverTimestamp() });
}

/**
 * Manual balance override — e.g. user reconciling against a real-world
 * statement. T6 transactions will call `adjustBalance` instead so
 * deltas stay atomic with transaction writes.
 */
export async function setBalance(wid: string, id: string, newBalance: number): Promise<void> {
  await updateDoc(accountRef(wid, id), {
    currentBalance: newBalance,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Atomic increment of `currentBalance`. T6 wires every transaction
 * write through this so the per-account balance stays in sync without
 * needing a recompute pass. Negative deltas decrement.
 */
export async function adjustBalance(wid: string, id: string, delta: number): Promise<void> {
  await updateDoc(accountRef(wid, id), {
    currentBalance: increment(delta),
    updatedAt: serverTimestamp(),
  });
}

export async function archiveAccount(wid: string, id: string): Promise<void> {
  await updateDoc(accountRef(wid, id), {
    isArchived: true,
    updatedAt: serverTimestamp(),
  });
}

export async function restoreAccount(wid: string, id: string): Promise<void> {
  await updateDoc(accountRef(wid, id), {
    isArchived: false,
    updatedAt: serverTimestamp(),
  });
}
