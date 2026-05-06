import type { CategoryMonthTotal } from '@compass/shared-types';
import {
  collection, doc, getDocs, increment, onSnapshot,
  serverTimestamp, where, query,
} from 'firebase/firestore';
import type { WriteBatch } from 'firebase/firestore';

import { db } from '../firebase/client';

/**
 * Per-category, per-month rollup used by the dashboard + budgets (T8/T9).
 * Doc id is deterministic — `${yearMonth}_${categoryId}` — so we can upsert
 * via `setDoc` + `merge: true` + `increment()` atomically with the
 * transaction write that produced the delta. No read-then-write race.
 *
 * Tracks expense rollup ONLY (ADR-07 §1). Income transactions don't write
 * here.
 */

export function categoryMonthTotalsCollection(wid: string) {
  return collection(db, 'workspaces', wid, 'category_month_totals');
}

export function categoryMonthTotalRef(wid: string, yearMonth: string, categoryId: string) {
  return doc(db, 'workspaces', wid, 'category_month_totals', `${yearMonth}_${categoryId}`);
}

/**
 * Apply a delta (positive or negative, in minor units) to a category's
 * month total inside an existing batch. Caller commits.
 *
 * `merge: true` so the doc is created on the first write — no need for a
 * separate "ensure exists" step. `txCountDelta` is +1 for new transactions
 * and -1 for deletes / reverses.
 */
export function addToCategoryMonthTotal(
  batch: WriteBatch,
  wid: string,
  yearMonth: string,
  categoryId: string,
  amountDeltaMinor: number,
  txCountDelta: number,
): void {
  batch.set(
    categoryMonthTotalRef(wid, yearMonth, categoryId),
    {
      categoryId,
      yearMonth,
      totalIDR: increment(amountDeltaMinor),
      txCount: increment(txCountDelta),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Read all category totals for a given month. Used by the dashboard's
 * top-3 categories + spending bar (T8) and the budgets progress bars
 * (T9).
 */
export async function listMonthTotals(wid: string, yearMonth: string): Promise<CategoryMonthTotal[]> {
  const q = query(
    categoryMonthTotalsCollection(wid),
    where('yearMonth', '==', yearMonth),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CategoryMonthTotal);
}

export function subscribeMonthTotals(
  wid: string,
  yearMonth: string,
  cb: (totals: CategoryMonthTotal[]) => void,
): () => void {
  const q = query(
    categoryMonthTotalsCollection(wid),
    where('yearMonth', '==', yearMonth),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data() as CategoryMonthTotal));
  });
}
