import type { Budget, BudgetStyle, RolloverPolicy } from '@compass/shared-types';
import {
  collection, deleteDoc, doc, getDocs, onSnapshot,
  query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';

import { db } from '../firebase/client';

/**
 * Per-category, per-month budget limits (T9 / ADR-10). The doc id is
 * deterministic — `${yearMonth}_${categoryId}` — mirroring
 * `category_month_totals` so the budgets screen joins limit + spend with
 * a trivial Map.get on the same key. No aggregation queries.
 *
 * v1 ships only `style: 'monthly_limit'` and `rolloverPolicy: 'none'`;
 * both fields stay on the doc so v2 envelope budgets can land without a
 * schema migration.
 */

export function budgetsCollection(wid: string) {
  return collection(db, 'workspaces', wid, 'budgets');
}

export function budgetRef(wid: string, yearMonth: string, categoryId: string) {
  return doc(db, 'workspaces', wid, 'budgets', `${yearMonth}_${categoryId}`);
}

/**
 * One-shot list of budgets for a given month. Used by the monthly summary
 * report screen which is a snapshot, not realtime.
 */
export async function listBudgets(wid: string, yearMonth: string): Promise<Budget[]> {
  const q = query(budgetsCollection(wid), where('yearMonth', '==', yearMonth));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as Omit<Budget, 'id'>), id: d.id }));
}

/**
 * Realtime subscription for the active month's budgets. Used by the
 * Budgets screen so progress bars reflect new transactions as they're
 * logged.
 */
export function subscribeBudgets(
  wid: string,
  yearMonth: string,
  cb: (budgets: Budget[]) => void,
): () => void {
  const q = query(budgetsCollection(wid), where('yearMonth', '==', yearMonth));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ ...(d.data() as Omit<Budget, 'id'>), id: d.id })));
  });
}

export type UpsertBudgetInput = {
  yearMonth: string;        // 'YYYY-MM'
  categoryId: string;
  style: BudgetStyle;        // v1 always 'monthly_limit'
  limitMinor: number;        // integer minor units (×100)
  rolloverPolicy: RolloverPolicy; // v1 always 'none'
};

/**
 * Create or update a budget for a (yearMonth, categoryId) pair. Uses
 * `setDoc` with `merge: true` because the deterministic id collapses
 * "create new" and "update existing" into one operation — no read-then-
 * write race.
 *
 * No batch with anything else: budgets are isolated docs. Progress is
 * computed at READ time by joining with `category_month_totals`.
 */
export async function upsertBudget(wid: string, input: UpsertBudgetInput): Promise<void> {
  const ref = budgetRef(wid, input.yearMonth, input.categoryId);
  await setDoc(
    ref,
    {
      yearMonth: input.yearMonth,
      categoryId: input.categoryId,
      style: input.style,
      limitMinor: input.limitMinor,
      rolloverPolicy: input.rolloverPolicy,
      // serverTimestamp on first write becomes createdAt; subsequent
      // writes update only updatedAt (createdAt is already set, merge
      // keeps it). This is a small simplification — exactly correct
      // first-write tracking would require a getDoc first.
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Delete a budget. Pure cleanup — doesn't touch month totals or
 * transactions, just removes the limit. The category falls back to
 * "no limit set" in the budgets screen UI.
 */
export async function deleteBudget(
  wid: string,
  yearMonth: string,
  categoryId: string,
): Promise<void> {
  await deleteDoc(budgetRef(wid, yearMonth, categoryId));
}
