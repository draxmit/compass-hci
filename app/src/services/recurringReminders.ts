import type { RecurringExpense } from '@/shared/utils/detectRecurring';
import {
  cancelByPrefix, notificationsSupported, scheduleAtDate,
} from './notifications';

/**
 * Days before the predicted next-fire date when the heads-up
 * notification fires. 2 days = enough time to cancel a Netflix
 * subscription or top up an account, but not so far ahead that the
 * predicted date is unreliable.
 */
const LEAD_TIME_DAYS = 2;

/** Identifier prefix so we can wipe + reschedule atomically. */
const ID_PREFIX = 'recurring:';

/**
 * Predict the next-expected fire date for a recurring expense. Given
 * the user's history, this assumes monthly cadence (the detector
 * itself enforces ≥3 distinct months as a recurrence signal — non-
 * monthly recurrences land in the same bucket but are visually
 * indistinguishable). Adds 1 month to the latest occurrence.
 *
 * Returns `null` when the predicted date is in the past — likely
 * means the recurrence has stopped, so we don't schedule a stale
 * reminder.
 */
function predictNextDate(latestISO: string): Date | null {
  const latest = new Date(`${latestISO}T09:00:00`);    // 9am local on the predicted day
  if (Number.isNaN(latest.getTime())) return null;
  const next = new Date(latest);
  next.setMonth(next.getMonth() + 1);
  if (next.getTime() < Date.now()) return null;
  return next;
}

/**
 * (Re)schedule local notifications for the user's detected recurring
 * expenses. Cancels every prior 'recurring:' notification first so
 * stale predictions (e.g. the user's Netflix charge moved by a few
 * days) don't pile up. Caller is responsible for deciding when to
 * call — typically when the recurrings list changes (Insights tab
 * opens / refreshes).
 *
 * Notifications fire at 9am LEAD_TIME_DAYS before the predicted next
 * fire date — early enough to act on, not so early that the prediction
 * is unreliable.
 *
 * Returns the count of notifications scheduled (0 on web / when
 * permissions denied / when nothing to schedule). Permission check
 * is the caller's responsibility; this function silently no-ops if
 * the OS later rejects the schedule call.
 */
export async function scheduleRecurringReminders(
  recurrings: RecurringExpense[],
  copy: { titleFor: (r: RecurringExpense) => string; bodyFor: (r: RecurringExpense, daysAhead: number) => string },
): Promise<number> {
  if (!notificationsSupported) return 0;
  // Always wipe-then-replace so the schedule reflects the LATEST
  // detection — no orphan reminders for subscriptions the user
  // cancelled, and no double-fires if the latest date shifted.
  await cancelByPrefix(ID_PREFIX);
  let scheduled = 0;
  for (const r of recurrings) {
    const next = predictNextDate(r.latestDate);
    if (!next) continue;
    const fireAt = new Date(next);
    fireAt.setDate(fireAt.getDate() - LEAD_TIME_DAYS);
    if (fireAt.getTime() < Date.now()) continue;
    const id = `${ID_PREFIX}${r.id}`;
    await scheduleAtDate(id, fireAt, copy.titleFor(r), copy.bodyFor(r, LEAD_TIME_DAYS));
    scheduled++;
  }
  return scheduled;
}
