import type { Goal, GoalKind } from '@compass/shared-types';
import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';

import { db } from '../firebase/client';

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
 * Atomic contribution. Increments the goal's `currentMinor`. Pure
 * tracking — does NOT touch any account balance. Per user feedback,
 * "contributing" to a goal is just an act of EARMARKING money you
 * already have toward a target; the money stays where it is. This
 * matches the envelope-budgeting mental model and avoids the
 * cross-currency footguns that the earlier "move money out of
 * source account" design produced (e.g. Rp 50jt requested from a
 * USD account, deducted as $500K of USD-cents because no FX
 * conversion).
 *
 * No transaction record is written — savings goals aren't expenses.
 * `category_month_totals` is not affected (a savings move shouldn't
 * count as 'spending in some category').
 *
 * Negative amounts walk the goal back (e.g. user accidentally
 * over-contributed). The UI keeps the happy-path gate at >0; this
 * service accepts any sign for symmetry.
 */
export async function contributeGoal(
  wid: string,
  goalId: string,
  amountMinor: number,
): Promise<void> {
  await updateDoc(goalRef(wid, goalId), {
    currentMinor: increment(amountMinor),
    updatedAt: serverTimestamp(),
  });
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
