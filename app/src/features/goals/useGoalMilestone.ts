import type { Goal } from '@compass/shared-types';
import { useEffect, useMemo, useState } from 'react';

import { updateUserDoc } from '@/services/firebase';
import { useAuthUser, useUserDoc } from '@/stores/authStore';

const MILESTONE_THRESHOLDS = [25, 50, 75, 100] as const;
type MilestoneThreshold = (typeof MILESTONE_THRESHOLDS)[number];

export type PendingMilestone = {
  goal: Goal;
  threshold: MilestoneThreshold;
  /** Progress at the moment this was detected (0..1+). */
  progress: number;
};

/**
 * Detect the highest unseen milestone (25/50/75/100%) across the user's
 * goals. Returns one milestone at a time — when the user dismisses
 * the celebration modal, `dismiss()` writes that threshold into the
 * user doc and the next render either shows the next-highest unseen
 * or null. This avoids a stack of modals firing in sequence on a
 * single goal that vaulted from 0% → 100%.
 *
 * Anti-spam invariants:
 *   - The threshold has to be CROSSED (progress >= threshold/100)
 *   - The threshold can't already be in users.goalMilestonesSeen[goalId]
 *   - 100% only fires once even if the user keeps adding contributions
 *
 * Called from the auth-gated app shell so it runs once on every
 * cold open + whenever the user doc / goals stream emits updates.
 */
export function useGoalMilestone(allGoals: Goal[]): {
  pending: PendingMilestone | null;
  dismiss: () => Promise<void>;
} {
  const user = useAuthUser();
  const userDoc = useUserDoc();
  const seenMap = userDoc?.goalMilestonesSeen ?? {};
  // Memoise the seen serialization so the deps stay stable.
  const seenSig = useMemo(
    () => Object.entries(seenMap)
      .map(([k, v]) => `${k}:${[...v].sort().join('-')}`)
      .sort()
      .join('|'),
    [seenMap],
  );
  const goalsSig = useMemo(
    () => allGoals
      .map((g) => `${g.id}@${g.currentMinor}/${g.targetMinor}`)
      .join('|'),
    [allGoals],
  );

  const pending = useMemo<PendingMilestone | null>(() => {
    for (const goal of allGoals) {
      if (goal.kind !== 'sinking_fund') continue;
      if (goal.targetMinor <= 0) continue;
      const progress = goal.currentMinor / goal.targetMinor;
      const seen = seenMap[goal.id] ?? [];
      // Walk milestones high-to-low so the most impressive unseen
      // milestone fires first when a goal jumps multiple thresholds at
      // once (which is rare but happens when a user backfills a big
      // contribution).
      for (let i = MILESTONE_THRESHOLDS.length - 1; i >= 0; i--) {
        const threshold = MILESTONE_THRESHOLDS[i]!;
        if (progress * 100 < threshold) continue;
        if (seen.includes(threshold)) continue;
        return { goal, threshold, progress };
      }
    }
    return null;
    // seen + goals signatures keep this memo stable across re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seenSig, goalsSig]);

  // Persist any UNDER-threshold goal as having seen the lower
  // thresholds, so a user who created a goal already 80% funded
  // doesn't get a 25/50/75 modal cascade for it. One-shot on first
  // detection per goal.
  const [bootstrapped, setBootstrapped] = useState(false);
  useEffect(() => {
    if (bootstrapped || !user || !userDoc) return;
    const updated: Record<string, number[]> = { ...seenMap };
    let changed = false;
    for (const goal of allGoals) {
      if (goal.kind !== 'sinking_fund') continue;
      if (goal.targetMinor <= 0) continue;
      const progress = goal.currentMinor / goal.targetMinor;
      const existing = new Set(updated[goal.id] ?? []);
      // Pre-seed every threshold STRICTLY BELOW current progress except
      // the highest one — that one we still want to celebrate.
      const crossed = MILESTONE_THRESHOLDS.filter((t) => progress * 100 >= t);
      if (crossed.length === 0) continue;
      const highestCrossed = crossed[crossed.length - 1]!;
      const toPreSeed = crossed.filter((t) => t !== highestCrossed);
      for (const t of toPreSeed) {
        if (!existing.has(t)) {
          existing.add(t);
          changed = true;
        }
      }
      updated[goal.id] = [...existing].sort();
    }
    if (changed) {
      void updateUserDoc(user.uid, { goalMilestonesSeen: updated }).catch(() => {});
    }
    setBootstrapped(true);
    // bootstrap once per session — userDoc.goals are independent of this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bootstrapped, goalsSig]);

  const dismiss = async () => {
    if (!pending || !user) return;
    const next: Record<string, number[]> = { ...seenMap };
    const existing = new Set(next[pending.goal.id] ?? []);
    existing.add(pending.threshold);
    next[pending.goal.id] = [...existing].sort();
    try {
      await updateUserDoc(user.uid, { goalMilestonesSeen: next });
    } catch (err) {
      console.warn('[goal-milestone] dismiss failed', err);
    }
  };

  return { pending, dismiss };
}
