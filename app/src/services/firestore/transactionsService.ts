import type { Currency, Split, Transaction, TransactionType } from '@compass/shared-types';
import {
  collection, doc, getCountFromServer, getDoc, getDocs, increment, onSnapshot,
  orderBy, limit as fsLimit, query, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';

import { convertToIDRMinor } from '@/shared/utils/fxRates';

import { db } from '../firebase/client';
import { addToCategoryMonthTotal } from './categoryMonthTotalsService';

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
    source: input.source,
    rawInput: input.rawInput,
    confidence: input.confidence,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Balance deltas
  if (input.type === 'expense') {
    batch.update(accountRef(wid, input.accountId), {
      currentBalance: increment(-input.amount),
      updatedAt: serverTimestamp(),
    });
  } else if (input.type === 'income') {
    batch.update(accountRef(wid, input.accountId), {
      currentBalance: increment(input.amount),
      updatedAt: serverTimestamp(),
    });
  } else {
    // transfer: -from, +to
    batch.update(accountRef(wid, input.accountId), {
      currentBalance: increment(-input.amount),
      updatedAt: serverTimestamp(),
    });
    if (input.toAccountId) {
      batch.update(accountRef(wid, input.toAccountId), {
        currentBalance: increment(input.amount),
        updatedAt: serverTimestamp(),
      });
    }
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
 */
export async function listTransactions(
  wid: string,
  opts: { yearMonth?: string; limit?: number; orderByDate?: boolean } = {},
): Promise<Transaction[]> {
  const orderByDate = opts.orderByDate !== false;   // default true
  const constraints = [];
  if (opts.yearMonth) constraints.push(where('yearMonth', '==', opts.yearMonth));
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
 */
export type UpdateTransactionInput = {
  description?: string;
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

  const batch = writeBatch(db);
  batch.delete(transactionRef(wid, id));

  if (tx.type === 'expense') {
    batch.update(accountRef(wid, tx.accountId), {
      currentBalance: increment(tx.amount),
      updatedAt: serverTimestamp(),
    });
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
  } else if (tx.type === 'income') {
    batch.update(accountRef(wid, tx.accountId), {
      currentBalance: increment(-tx.amount),
      updatedAt: serverTimestamp(),
    });
  } else {
    // transfer reverse
    batch.update(accountRef(wid, tx.accountId), {
      currentBalance: increment(tx.amount),
      updatedAt: serverTimestamp(),
    });
    if (tx.toAccountId) {
      batch.update(accountRef(wid, tx.toAccountId), {
        currentBalance: increment(-tx.amount),
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
}
