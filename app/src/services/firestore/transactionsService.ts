import type {
  Account, Currency, Split, Transaction, TransactionType,
} from '@compass/shared-types';
import {
  collection, doc, getCountFromServer, getDoc, getDocs, increment, onSnapshot,
  orderBy, limit as fsLimit, query, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';

import { convertToIDRMinor } from '@/shared/utils/fxRates';

import { db } from '../firebase/client';
import { addToCategoryMonthTotal } from './categoryMonthTotalsService';

/**
 * Liability vs asset (ADR-22). Credit cards are tracked as liability
 * accounts: the stored `currentBalance` represents amount OWED, never
 * negative. Sign semantics flip vs asset accounts:
 *   - Spending on a card (outflow) INCREASES owed
 *   - Paying a card (inflow / transfer-in) DECREASES owed
 *   - Cash advance (transfer FROM card) INCREASES owed
 *
 * Asset accounts (cash/bank/ewallet) use the natural model: outflow
 * subtracts, inflow adds. All accounts validate `balance >= 0` at
 * write time — no account ever stores a negative number.
 */
function isLiabilityType(type: Account['type']): boolean {
  return type === 'credit_card';
}

/**
 * Compute the signed delta to apply to `currentBalance` for an
 * outflow or inflow of `amount` on `accountType`.
 */
function balanceDelta(
  amount: number,
  accountType: Account['type'],
  direction: 'in' | 'out',
): number {
  const isLiab = isLiabilityType(accountType);
  if (direction === 'out') return isLiab ? amount : -amount;
  return isLiab ? -amount : amount;
}

/** Custom error type so callers can detect validation failures vs
 *  generic Firestore errors and surface a friendly i18n message. */
export class InsufficientBalanceError extends Error {
  constructor(public readonly accountId: string) {
    super(`Insufficient balance for account ${accountId}`);
    this.name = 'InsufficientBalanceError';
  }
}

function transactionsCollection(wid: string) {
  return collection(db, 'workspaces', wid, 'transactions');
}
function transactionRef(wid: string, id: string) {
  return doc(db, 'workspaces', wid, 'transactions', id);
}
function accountRef(wid: string, accountId: string) {
  return doc(db, 'workspaces', wid, 'accounts', accountId);
}

export type CreateTransactionInput = {
  type: TransactionType;
  date: string;                // YYYY-MM-DD
  accountId: string;
  toAccountId: string | null;  // transfer only — must be same currency in v2
  /**
   * Tx currency, denormalised from the source account at write time.
   * Optional in the input shape so legacy callers (pre-multi-currency)
   * still default to IDR. New callers (form, NLP, CSV import) pass the
   * account's currency explicitly. Cross-currency transfers are not
   * supported in v2 — caller (UI) enforces same-currency.
   */
  currency?: Currency;
  amount: number;              // integer minor units in `currency`
  splits: Split[];             // length 1 in v1; [] for transfers; in `currency`
  description: string;
  /**
   * Optional tags array. Caller passes tags already normalised
   * (lower-cased, deduped, trimmed). Service writes the array
   * unchanged; downstream readers + filters trust the normalisation.
   */
  tags?: string[];
  source: 'manual' | 'nlp';
  rawInput: string | null;
  confidence: number | null;
};

/**
 * Atomic transaction write (ADR-07 §2). Builds a single Firestore batch
 * containing:
 *   - tx doc
 *   - balance delta(s) on the affected account(s) via FieldValue.increment
 *   - month-total upsert(s) for expense splits
 *
 * Single source of truth for transaction writes — never write to the
 * `transactions` collection directly. The service is responsible for
 * keeping `accounts.currentBalance` and `category_month_totals` in sync
 * with the transaction record.
 */
export async function createTransaction(
  wid: string,
  input: CreateTransactionInput,
): Promise<string> {
  const txRef = doc(transactionsCollection(wid));
  const yearMonth = input.date.slice(0, 7);  // 'YYYY-MM'
  const currency: Currency = input.currency ?? 'IDR';
  // FX snapshot at write time — frozen on the doc so historical reports
  // remain stable when rates update later. For IDR this is identity.
  const amountIDR = convertToIDRMinor(input.amount, currency);

  // Read affected accounts upfront — needed for the liability sign-flip
  // (credit_card type stores positive owed amounts) and the no-negative
  // balance validation. Pre-batch reads aren't atomic with the write,
  // but the validation is best-effort UX guard rail; the rare race
  // (two concurrent txs draining the same account) is acceptable for
  // a personal-finance app at v2 scale.
  const sourceSnap = await getDoc(accountRef(wid, input.accountId));
  if (!sourceSnap.exists()) {
    throw new Error(`Source account ${input.accountId} not found`);
  }
  const sourceData = sourceSnap.data() as Account;

  let destData: Account | null = null;
  if (input.type === 'transfer' && input.toAccountId) {
    const destSnap = await getDoc(accountRef(wid, input.toAccountId));
    if (!destSnap.exists()) {
      throw new Error(`Destination account ${input.toAccountId} not found`);
    }
    destData = destSnap.data() as Account;
  }

  // Compute deltas with sign-flip semantics for liability accounts.
  let sourceDelta = 0;
  let destDelta = 0;
  if (input.type === 'expense') {
    sourceDelta = balanceDelta(input.amount, sourceData.type, 'out');
  } else if (input.type === 'income') {
    sourceDelta = balanceDelta(input.amount, sourceData.type, 'in');
  } else {
    // transfer: outflow source + inflow dest
    sourceDelta = balanceDelta(input.amount, sourceData.type, 'out');
    if (destData) destDelta = balanceDelta(input.amount, destData.type, 'in');
  }

  // No-negative-balance gate (ADR-22). Asset accounts can't be drained
  // below zero; liability accounts can't be paid below zero (overpaying
  // a card doesn't make sense).
  if (sourceData.currentBalance + sourceDelta < 0) {
    throw new InsufficientBalanceError(input.accountId);
  }
  if (destData && destData.currentBalance + destDelta < 0) {
    throw new InsufficientBalanceError(input.toAccountId!);
  }

  const batch = writeBatch(db);
  batch.set(txRef, {
    type: input.type,
    date: input.date,
    yearMonth,
    accountId: input.accountId,
    toAccountId: input.toAccountId,
    currency,
    amount: input.amount,
    amountIDR,
    splits: input.splits,
    description: input.description,
    tags: input.tags ?? [],
    source: input.source,
    rawInput: input.rawInput,
    confidence: input.confidence,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(accountRef(wid, input.accountId), {
    currentBalance: increment(sourceDelta),
    updatedAt: serverTimestamp(),
  });
  if (destData && input.toAccountId) {
    batch.update(accountRef(wid, input.toAccountId), {
      currentBalance: increment(destDelta),
      updatedAt: serverTimestamp(),
    });
  }

  // Category month totals (expense only) — denominated in IDR so the
  // dashboard "this month" total + budget progress are meaningful across
  // accounts of different currencies. For multi-split, distribute the
  // tx's amountIDR proportionally to each split's share of tx.amount,
  // so the per-split IDR amounts always sum back to amountIDR exactly.
  // For single-split (the v2 norm), splitIDR === amountIDR.
  if (input.type === 'expense') {
    for (const split of input.splits) {
      const splitIDR = input.amount === 0
        ? 0
        : Math.round(split.amount * (amountIDR / input.amount));
      addToCategoryMonthTotal(batch, wid, yearMonth, split.categoryId, splitIDR, 1);
    }
  }

  await batch.commit();
  return txRef.id;
}

/**
 * One-shot list. Filter shape kept narrow for v1.
 *
 * Note on `orderByDate`: combining `where('yearMonth', '==')` with
 * `orderBy('date', 'desc')` requires a composite index on
 * `(yearMonth ASC, date DESC)`. We DO declare that index in
 * `firestore.indexes.json` for the report screen. Insights doesn't
 * need date order (it filters by day-of-month + by category), so it
 * passes `orderByDate: false` and sorts client-side if needed —
 * dodging the index dependency for callers that don't care.
 *
 * `yearMonthIn` is a v3 phase A — 6 addition for the year heatmap.
 * Replaces 12 sequential per-month queries with a single
 * `where('yearMonth', 'in', [...])` query. Firestore caps `in` at
 * 30 values; for our 12-month window that's plenty. Mutually
 * exclusive with `yearMonth` — caller picks one.
 */
export async function listTransactions(
  wid: string,
  opts: {
    yearMonth?: string;
    yearMonthIn?: string[];
    limit?: number;
    orderByDate?: boolean;
  } = {},
): Promise<Transaction[]> {
  const orderByDate = opts.orderByDate !== false;   // default true
  const constraints = [];
  if (opts.yearMonth) {
    constraints.push(where('yearMonth', '==', opts.yearMonth));
  } else if (opts.yearMonthIn && opts.yearMonthIn.length > 0) {
    // Firestore `in` queries cap at 30 values; we cap at 30 here to
    // surface the limit rather than silently truncate. Caller must
    // chunk if they need more.
    if (opts.yearMonthIn.length > 30) {
      throw new Error(`yearMonthIn capped at 30 values (got ${opts.yearMonthIn.length})`);
    }
    constraints.push(where('yearMonth', 'in', opts.yearMonthIn));
  }
  if (orderByDate) constraints.push(orderBy('date', 'desc'));
  if (opts.limit) constraints.push(fsLimit(opts.limit));
  const snap = await getDocs(query(transactionsCollection(wid), ...constraints));
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Transaction, 'id'>), id: d.id }));
}

/**
 * Realtime subscription to the most recent N transactions across all
 * months. Used by Dashboard's "recent transactions" strip (T8).
 */
export function subscribeRecent(
  wid: string,
  count: number,
  cb: (txs: Transaction[]) => void,
): () => void {
  const q = query(
    transactionsCollection(wid),
    orderBy('date', 'desc'),
    fsLimit(count),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ ...(d.data() as Omit<Transaction, 'id'>), id: d.id })));
  });
}

/**
 * One-shot transaction count for the workspace. Uses Firestore's
 * server-side aggregation (`getCountFromServer`) so we don't pull every
 * doc into memory just to count them. Used by the Profile screen's
 * "Transactions logged" stat.
 *
 * Not realtime — Profile fetches on each mount, which is fresh enough
 * because the user can't be on Profile and the entry screen at the same
 * time.
 */
export async function getTransactionCount(wid: string): Promise<number> {
  const snap = await getCountFromServer(transactionsCollection(wid));
  return snap.data().count;
}

/**
 * Read one transaction by id. Used by the edit screen to pre-fill form
 * state from the existing record.
 */
export async function getTransaction(wid: string, id: string): Promise<Transaction | null> {
  const snap = await getDoc(transactionRef(wid, id));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Omit<Transaction, 'id'>), id: snap.id };
}

/**
 * Patch shape for `updateTransaction`. Explicitly limited to
 * non-financial metadata (ADR-08 §1). Editing amount / account / category /
 * type goes through `deleteTransaction` + `createTransaction` so the
 * atomic-write invariant for balance + month totals stays intact.
 *
 * Tags (ADR-17) are non-financial — they don't affect balances or
 * monthly totals — so they ride this path too.
 */
export type UpdateTransactionInput = {
  description?: string;
  tags?: string[];
};

/**
 * Patch a transaction's non-financial metadata (currently just
 * `description`). Refuses to touch any financial field — both at the
 * type level (UpdateTransactionInput omits them) and at runtime (guard).
 */
export async function updateTransaction(
  wid: string,
  id: string,
  patch: UpdateTransactionInput,
): Promise<void> {
  // Defensive runtime guard — the type already excludes financial keys,
  // but keep the runtime check so an `as` cast can't bypass the invariant.
  const forbidden = ['amount', 'amountIDR', 'currency', 'type', 'accountId', 'toAccountId', 'splits', 'date', 'yearMonth'];
  for (const key of forbidden) {
    if (key in (patch as Record<string, unknown>)) {
      throw new Error(`updateTransaction: '${key}' must flow through deleteTransaction + createTransaction`);
    }
  }
  await updateDoc(transactionRef(wid, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Hard delete with reversal. Batches the doc delete with reversed balance
 * + month-total updates so the financial state stays consistent. Editing
 * a transaction's amount/account/category goes through delete + recreate
 * (ADR-08 §1) — `updateTransaction` only patches non-financial metadata.
 */
export async function deleteTransaction(wid: string, id: string): Promise<void> {
  const snap = await getDoc(transactionRef(wid, id));
  if (!snap.exists()) throw new Error(`Transaction ${id} not found`);
  const tx = snap.data() as Transaction;

  // Read the affected accounts to know their type (asset vs liability)
  // so the reversal applies the correct sign-flip — same logic as
  // createTransaction, just inverted direction.
  const sourceSnap = await getDoc(accountRef(wid, tx.accountId));
  if (!sourceSnap.exists()) {
    throw new Error(`Source account ${tx.accountId} not found on tx delete`);
  }
  const sourceData = sourceSnap.data() as Account;
  let destData: Account | null = null;
  if (tx.type === 'transfer' && tx.toAccountId) {
    const destSnap = await getDoc(accountRef(wid, tx.toAccountId));
    if (destSnap.exists()) destData = destSnap.data() as Account;
  }

  // Reversal deltas — direction inverted vs createTransaction.
  // create:expense → outflow, delete:expense → inflow (give back).
  let sourceDelta = 0;
  let destDelta = 0;
  if (tx.type === 'expense') {
    sourceDelta = balanceDelta(tx.amount, sourceData.type, 'in');
  } else if (tx.type === 'income') {
    sourceDelta = balanceDelta(tx.amount, sourceData.type, 'out');
  } else {
    // transfer: original was out-of-source + into-dest; reverse both
    sourceDelta = balanceDelta(tx.amount, sourceData.type, 'in');
    if (destData) destDelta = balanceDelta(tx.amount, destData.type, 'out');
  }

  const batch = writeBatch(db);
  batch.delete(transactionRef(wid, id));

  batch.update(accountRef(wid, tx.accountId), {
    currentBalance: increment(sourceDelta),
    updatedAt: serverTimestamp(),
  });
  if (destData && tx.toAccountId) {
    batch.update(accountRef(wid, tx.toAccountId), {
      currentBalance: increment(destDelta),
      updatedAt: serverTimestamp(),
    });
  }

  if (tx.type === 'expense') {
    // Mirror the create-time proportional distribution so the reversal
    // exactly cancels the original increment, even on multi-split
    // non-IDR transactions. tx.amountIDR is the FX snapshot frozen at
    // create time — using it here keeps deletes drift-free against
    // later rate changes.
    for (const split of tx.splits) {
      const splitIDR = tx.amount === 0
        ? 0
        : Math.round(split.amount * (tx.amountIDR / tx.amount));
      addToCategoryMonthTotal(batch, wid, tx.yearMonth, split.categoryId, -splitIDR, -1);
    }
  }

  await batch.commit();
}
