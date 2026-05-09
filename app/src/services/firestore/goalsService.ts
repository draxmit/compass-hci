import type { Account, Goal, GoalKind } from '@compass/shared-types';
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot,
  serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';

import { db } from '../firebase/client';
import { convertFromIDRMinor } from '@/shared/utils/fxRates';
import { balanceDelta, InsufficientBalanceError } from './transactionsService';

/**
 * Goals CRUD (ADR-15). Sinking funds in v2 launch; habit streaks
 * forward-compat for v2.5. No batch writes — goals are isolated
 * documents (no denormalisation chain).
 */

export function goalsCollection(wid: string) {
  return collection(db, 'workspaces', wid, 'goals');
}

export function goalRef(wid: string, id: string) {
  return doc(db, 'workspaces', wid, 'goals', id);
}

export async function listGoals(wid: string): Promise<Goal[]> {
  const snap = await getDocs(goalsCollection(wid));
  return snap.docs
    .map((d) => ({ ...(d.data() as Omit<Goal, 'id'>), id: d.id }))
    .sort((a, b) => {
      // Stable order: oldest first. Used to drive "primary" goal on
      // Dashboard pill (per ADR-15 §6) — the first by createdAt is the
      // user's primary in v2 launch.
      const ta = (a.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
      const tb = (b.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
      return ta - tb;
    });
}

export function subscribeGoals(
  wid: string,
  cb: (goals: Goal[]) => void,
): () => void {
  return onSnapshot(goalsCollection(wid), (snap) => {
    const list = snap.docs
      .map((d) => ({ ...(d.data() as Omit<Goal, 'id'>), id: d.id }))
      .sort((a, b) => {
        const ta = (a.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
        const tb = (b.createdAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
        return ta - tb;
      });
    cb(list);
  });
}

export type CreateGoalInput = {
  kind: GoalKind;
  name: string;
  targetMinor: number;
  currentMinor: number;
  targetDate: string | null;
  templateKey: string | null;
};

export async function createGoal(wid: string, input: CreateGoalInput): Promise<string> {
  const ref = doc(goalsCollection(wid));
  await setDoc(ref, {
    kind: input.kind,
    name: input.name,
    targetMinor: input.targetMinor,
    currentMinor: input.currentMinor,
    targetDate: input.targetDate,
    templateKey: input.templateKey,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Patch shape — limited to user-mutable fields. `kind`, `id`,
 * `createdAt`, `currentMinor` excluded. Use `contributeGoal` for
 * currentMinor changes (atomic increment).
 */
export type UpdateGoalInput = Partial<
  Pick<Goal, 'name' | 'targetMinor' | 'targetDate' | 'templateKey'>
>;

export async function updateGoal(
  wid: string,
  id: string,
  patch: UpdateGoalInput,
): Promise<void> {
  await updateDoc(goalRef(wid, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Atomic contribution. Increments the goal's `currentMinor` AND
 * decrements the source account's `currentBalance` in a single batch
 * so the user's account balance reflects the move. No transaction
 * record is written — contributions are notional savings, not
 * categorised expenses. (v2.5 may add an opt-in tx record.)
 *
 * Note: this means `category_month_totals` is not affected. The
 * monthly Insights / Budgets stay clean (a savings move shouldn't
 * count as 'spending in some category').
 *
 * == Currency + balance correctness ==
 *
 * The user types `amountMinor` in IDR (the only currency the
 * contribution UI accepts). Goals always store `currentMinor` in
 * IDR. But the source account's `currentBalance` is in its NATIVE
 * currency — for a USD account that's USD-cents, not IDR-minor.
 *
 * Earlier impl deducted `amountMinor` 1:1 from `currentBalance`
 * regardless of currency, which translated Rp 50jt (5 billion IDR-
 * minor) into a $50 million USD-cents deduction from a $2k account.
 *
 * Now: we read the source account upfront, convert the IDR amount
 * into the account's native units via the FX snapshot, validate
 * the balance won't go below zero (asset accounts) or above zero
 * (liability accounts — paying down a card), then apply the
 * properly-converted delta. Same no-negative-balance gate as
 * `transactionsService.createTransaction` (ADR-22).
 *
 * Negative amounts walk a goal back (and credit the account); the
 * UI is the gate that prevents zero/negative amounts on the happy
 * path. We still convert / validate symmetrically so a "walk back"
 * from a foreign account also goes through the FX rate.
 */
export async function contributeGoal(
  wid: string,
  goalId: string,
  accountId: string,
  amountMinor: number,
): Promise<void> {
  // Read the source account so we know its currency + type + balance.
  // Pre-batch read isn't strictly atomic with the write but matches
  // the pattern transactionsService uses; the rare race (two contribs
  // at once draining the same account) is acceptable for personal
  // finance scale.
  const accRef = doc(db, 'workspaces', wid, 'accounts', accountId);
  const accSnap = await getDoc(accRef);
  if (!accSnap.exists()) {
    throw new Error(`Source account ${accountId} not found`);
  }
  const accData = accSnap.data() as Account;
  // FX-convert: IDR amount → account's native minor units. For an
  // IDR-currency account this is an identity pass-through.
  const nativeAmount = convertFromIDRMinor(amountMinor, accData.currency);
  // Sign-flip per account type. A goal contribution is an OUTFLOW
  // from the source — for asset accounts that's a negative delta;
  // for credit_card (liability) it's a positive delta (more debt).
  const accountDelta = balanceDelta(nativeAmount, accData.type, 'out');
  if (accData.currentBalance + accountDelta < 0) {
    throw new InsufficientBalanceError(accountId);
  }
  const batch = writeBatch(db);
  batch.update(goalRef(wid, goalId), {
    currentMinor: increment(amountMinor),
    updatedAt: serverTimestamp(),
  });
  batch.update(accRef, {
    currentBalance: increment(accountDelta),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function deleteGoal(wid: string, id: string): Promise<void> {
  await deleteDoc(goalRef(wid, id));
}

/**
 * Realtime subscription to a single goal — the dashboard pin uses this
 * so the pinned goal's progress updates without a full goals-list
 * subscription. `cb` is invoked with `null` when the goal doesn't
 * exist (e.g. user deleted it without un-pinning). Caller should
 * defensively clear `users.pinnedGoalId` in that case.
 */
export function subscribeGoal(
  wid: string,
  id: string,
  cb: (goal: Goal | null) => void,
): () => void {
  return onSnapshot(goalRef(wid, id), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    cb({ ...(snap.data() as Omit<Goal, 'id'>), id: snap.id });
  });
}

/**
 * One-shot migration from `users.primaryGoal` (free-text, pre-v2.0)
 * to a real Goal doc + `users.pinnedGoalId` reference (ADR-20).
 *
 * Self-healing — re-running is a no-op:
 *   - if `pinnedGoalId` is already set, nothing to do.
 *   - if `primaryGoal` is empty/null, mark migrated with `null` pin.
 *   - if a goal with the same name already exists, REUSE it instead
 *     of creating a duplicate (this fixes the previously-observed
 *     duplicate-goal bug where two migration runs created two goals
 *     with identical names — the second call now finds the first
 *     goal and pins THAT instead of creating a third).
 *   - otherwise: create a sinking-fund goal with the text as its
 *     name (target = 0, no date), pin it, clear `primaryGoal`.
 *
 * Called from `useAuthSubscription` after ensureUserDoc resolves,
 * alongside the categories seed + accounts migration.
 */
export async function migratePrimaryGoalToPinned(
  uid: string,
  wid: string,
): Promise<void> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  const data = userSnap.data() as { primaryGoal?: string | null; pinnedGoalId?: string | null };

  // Already migrated, or never had a goal — bail.
  if (data.pinnedGoalId !== undefined) return;
  const text = (data.primaryGoal ?? '').trim();
  if (text.length === 0) {
    // Mark as migrated by writing pinnedGoalId: null so we don't
    // re-check on every sign-in. Doesn't change observable behaviour.
    await updateDoc(userRef, { pinnedGoalId: null });
    return;
  }

  // Dedup: scan existing goals for a name match. If we find one,
  // pin that goal instead of creating a duplicate. Catches the case
  // where a previous (racy) migration run created the goal but
  // failed to write back pinnedGoalId.
  const existingSnap = await getDocs(goalsCollection(wid));
  const existing = existingSnap.docs.find((d) => {
    const g = d.data() as Goal;
    return typeof g.name === 'string' && g.name.trim() === text;
  });

  const goalId = existing
    ? existing.id
    : await createGoal(wid, {
      kind: 'sinking_fund',
      name: text,
      targetMinor: 0,
      currentMinor: 0,
      targetDate: null,
      templateKey: null,
    });

  await updateDoc(userRef, {
    pinnedGoalId: goalId,
    primaryGoal: null,
  });
}
