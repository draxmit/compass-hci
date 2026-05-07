import type {
  Account, AccountSubtype, AccountType, CategoryColor, CategoryIcon, Currency,
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
  /**
   * Account currency (v2 multi-currency / ADR-16). Optional in the
   * input shape so legacy callers still default to IDR; the service
   * fills 'IDR' when omitted. New callers (account form, demo seed)
   * pass an explicit value.
   */
  currency?: Currency;
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
 * Defensive read-layer normaliser. v1 docs have no `currency` field; v2
 * widens the field but reads must tolerate the legacy shape. Anything
 * that isn't a valid {@link Currency} string falls back to IDR.
 *
 * Cheap to call on every doc — the field-presence check is one property
 * lookup. Kept centralised so callers downstream can trust `acc.currency`
 * is always a real Currency.
 */
function normalizeAccount(raw: Omit<Account, 'id'>, id: string): Account {
  const c = (raw as Account).currency;
  const currency: Currency =
    c === 'IDR' || c === 'USD' || c === 'SGD' || c === 'EUR' || c === 'AUD' ||
    c === 'JPY' || c === 'GBP' || c === 'MYR' || c === 'THB' || c === 'CNY'
      ? c
      : 'IDR';
  return { ...raw, currency, id };
}

/**
 * One-shot read. Filter + sort client-side (same rationale as
 * categoriesService — avoids the where()+orderBy() composite index).
 */
export async function listAccounts(wid: string): Promise<Account[]> {
  const snap = await getDocs(accountsCollection(wid));
  return snap.docs
    .map((d) => normalizeAccount(d.data() as Omit<Account, 'id'>, d.id))
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
      .map((d) => normalizeAccount(d.data() as Omit<Account, 'id'>, d.id))
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
      currency: input.currency ?? 'IDR',
      // Stored as integer minor units (×100 the displayed amount, uniform
      // across all currencies). Caller passes parsed minor units.
      currentBalance: input.initialBalance,
      initialBalance: input.initialBalance,
      includedInNetWorth: input.includedInNetWorth,
      isArchived: false,
      icon: input.icon,
      color: input.color,
      order: nextOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Pre-mark new accounts as already-migrated so the migration helper
      // doesn't double-multiply them on the next sign-in. Same for the
      // ADR-22 liability sign-flip migration.
      [BALANCE_UNITS_MARKER]: true,
      [LIABILITY_MODEL_MARKER]: true,
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

const BALANCE_UNITS_MARKER = '_balanceUnitsV2' as const;

/**
 * One-shot migration from "integer rupiah" → "integer minor units" (×100).
 * Idempotent via the `_balanceUnitsV2: true` doc marker. Required because
 * accounts created before this change stored the displayed value directly
 * (e.g. Rp 1.000.000 → 1000000); the new formatIDR + balance helpers
 * expect minor units (Rp 1.000.000 → 100000000).
 *
 * Migration logic:
 *   - Skip docs where `_balanceUnitsV2 === true`.
 *   - For un-migrated docs: multiply currentBalance + initialBalance × 100,
 *     set the marker.
 *
 * Called from the auth subscription on every sign-in (alongside
 * ensureCategoriesSeeded). Self-healing — if the migration fails or only
 * partially completes, the next sign-in retries.
 */
export async function migrateAccountBalancesToMinorUnits(wid: string): Promise<void> {
  const snap = await getDocs(accountsCollection(wid));
  const unmigrated = snap.docs.filter((d) => {
    const data = d.data() as Record<string, unknown>;
    return data[BALANCE_UNITS_MARKER] !== true;
  });
  if (unmigrated.length === 0) return;

  const batch = writeBatch(db);
  for (const d of unmigrated) {
    const data = d.data() as Account;
    batch.update(d.ref, {
      currentBalance: (data.currentBalance ?? 0) * 100,
      initialBalance: (data.initialBalance ?? 0) * 100,
      [BALANCE_UNITS_MARKER]: true,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

const LIABILITY_MODEL_MARKER = '_liabilityModelV2' as const;

/**
 * One-shot migration to ADR-22's liability model. Pre-v2.x stored
 * credit_card balances as negative numbers (debt = below zero). The
 * new model stores them as positive owed amounts. This helper flips
 * the sign for any credit_card account that hasn't been migrated yet.
 *
 * Idempotent via the `_liabilityModelV2: true` marker. New accounts
 * created post-ADR-22 set the marker at create time so they skip
 * this migration on subsequent sign-ins.
 *
 * Called from `useAuthSubscription` after the categories seed +
 * minor-units migration, alongside the goal migration.
 */
export async function migrateAccountsToLiabilityModel(wid: string): Promise<void> {
  const snap = await getDocs(accountsCollection(wid));
  const candidates = snap.docs.filter((d) => {
    const data = d.data() as Record<string, unknown>;
    return data[LIABILITY_MODEL_MARKER] !== true;
  });
  if (candidates.length === 0) return;

  const batch = writeBatch(db);
  for (const d of candidates) {
    const data = d.data() as Account;
    // Only credit_card accounts need a sign flip; assets stay as-is.
    // For credit_card with negative balance: flip to positive owed
    // amount. Initial balance flips too so the audit-snapshot stays
    // consistent.
    if (data.type === 'credit_card') {
      const newCurrent = (typeof data.currentBalance === 'number' && data.currentBalance < 0)
        ? -data.currentBalance
        : data.currentBalance;
      const newInitial = (typeof data.initialBalance === 'number' && data.initialBalance < 0)
        ? -data.initialBalance
        : data.initialBalance;
      batch.update(d.ref, {
        currentBalance: newCurrent,
        initialBalance: newInitial,
        [LIABILITY_MODEL_MARKER]: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(d.ref, {
        [LIABILITY_MODEL_MARKER]: true,
        updatedAt: serverTimestamp(),
      });
    }
  }
  await batch.commit();
}
