import type { Goal, UserDoc } from '@compass/shared-types';
import type { TFunction } from 'i18next';

import {
  cancelByPrefix,
  fireImmediate,
  notificationsSupported,
  scheduleAtDate,
  scheduleDaily,
} from '@/services/notifications';
import type { Locale } from '@/shared/i18n';
import { formatIDR } from '@/shared/utils/formatIDR';

/**
 * Notification scheduler. Three categories, each with its own id
 * prefix so they can be torn down + rebuilt independently:
 *
 *   - daily:reminder        → daily 'log your expenses' nudge
 *   - goal:<goalId>:<n>     → 'N days until goal' deadline reminders
 *   - budget:<categoryId>:<bucket> → fired on tx write when a budget
 *                             crosses 80% / 100% threshold (immediate)
 *
 * The settings UI calls `syncDailyReminder` / `syncGoalReminders` after
 * the user toggles a setting; transactionsService calls
 * `checkBudgetAlerts` after every successful write.
 */

const DAILY_ID = 'daily:reminder';
const GOAL_PREFIX = 'goal:';
const BUDGET_PREFIX = 'budget:';

/**
 * Default settings applied when `userDoc.notifications` is absent
 * (legacy v3-pre-phase-B docs). All toggles default OFF — opt-in is
 * the safer default than spamming the user on first install.
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NonNullable<UserDoc['notifications']> = {
  dailyReminder: false,
  dailyReminderTime: '20:00',
  budgetAlerts: false,
  budgetThreshold: 0.8,
  goalReminders: false,
};

/** Read settings off the user doc, falling back to all-off defaults. */
export function readSettings(
  userDoc: UserDoc | null,
): NonNullable<UserDoc['notifications']> {
  return userDoc?.notifications ?? DEFAULT_NOTIFICATION_SETTINGS;
}

/**
 * Reschedule the daily logging reminder. Cancel-then-schedule so the
 * time can be changed (cancel by id is automatic in scheduleDaily).
 *
 * If `dailyReminder === false`, just cancels.
 */
export async function syncDailyReminder(
  settings: NonNullable<UserDoc['notifications']>,
  t: TFunction,
): Promise<void> {
  if (!notificationsSupported) return;
  await cancelByPrefix(DAILY_ID);
  if (!settings.dailyReminder) return;
  const [hhStr, mmStr] = settings.dailyReminderTime.split(':');
  const hh = Math.max(0, Math.min(23, Number(hhStr) || 20));
  const mm = Math.max(0, Math.min(59, Number(mmStr) || 0));
  await scheduleDaily(
    DAILY_ID,
    hh,
    mm,
    t('settings:notifications.daily.notifTitle'),
    t('settings:notifications.daily.notifBody'),
  );
}

/**
 * Schedule deadline reminders for every goal with a `targetDate`.
 *
 * For each goal, we schedule TWO notifications: 7 days before and
 * 1 day before the target date. Past dates are skipped silently
 * (handled by scheduleAtDate's guard). Goals without a date are
 * skipped entirely (e.g. emergency fund — no fixed deadline).
 *
 * If `goalReminders === false`, just clears any existing schedules.
 */
export async function syncGoalReminders(
  settings: NonNullable<UserDoc['notifications']>,
  goals: Goal[],
  t: TFunction,
  lang: Locale,
): Promise<void> {
  if (!notificationsSupported) return;
  await cancelByPrefix(GOAL_PREFIX);
  if (!settings.goalReminders) return;

  for (const g of goals) {
    if (!g.targetDate) continue;
    const target = parseISODate(g.targetDate);
    if (!target) continue;
    const targetMs = target.getTime();
    // 7-day-before reminder
    const sevenDaysBefore = new Date(targetMs - 7 * 24 * 60 * 60 * 1000);
    sevenDaysBefore.setHours(9, 0, 0, 0); // 9am morning of that day
    await scheduleAtDate(
      `${GOAL_PREFIX}${g.id}:7d`,
      sevenDaysBefore,
      t('settings:notifications.goal.notifTitle', { goalName: g.name }),
      t('settings:notifications.goal.notifBody7d', {
        goalName: g.name,
        progress: formatIDR(g.currentMinor, lang),
        target: formatIDR(g.targetMinor, lang),
      }),
    );
    // 1-day-before reminder
    const oneDayBefore = new Date(targetMs - 24 * 60 * 60 * 1000);
    oneDayBefore.setHours(9, 0, 0, 0);
    await scheduleAtDate(
      `${GOAL_PREFIX}${g.id}:1d`,
      oneDayBefore,
      t('settings:notifications.goal.notifTitle', { goalName: g.name }),
      t('settings:notifications.goal.notifBody1d', {
        goalName: g.name,
        progress: formatIDR(g.currentMinor, lang),
        target: formatIDR(g.targetMinor, lang),
      }),
    );
  }
}

/**
 * Check budget thresholds after a transaction write. Fires an
 * IMMEDIATE notification when this transaction pushed a category's
 * monthly spend across the configured threshold (80% / 90% / 100%).
 *
 * Idempotent via the bucket suffix in the id: if `budget:foodId:80` is
 * already scheduled today, scheduling it again is a no-op (cancel-
 * then-schedule). We only fire ONCE per (category, threshold, day).
 *
 * Caller (transactionsService.createTransaction) provides the relevant
 * categories with their before/after spent values so this function
 * doesn't need to re-query Firestore.
 */
export async function checkBudgetAlerts(
  settings: NonNullable<UserDoc['notifications']>,
  events: BudgetCrossEvent[],
  t: TFunction,
  lang: Locale,
): Promise<void> {
  if (!notificationsSupported || !settings.budgetAlerts) return;
  for (const e of events) {
    const beforePct = e.limitMinor > 0 ? e.beforeMinor / e.limitMinor : 0;
    const afterPct = e.limitMinor > 0 ? e.afterMinor / e.limitMinor : 0;
    // Crossing IS the trigger: before was below threshold, after meets or exceeds.
    if (beforePct < settings.budgetThreshold && afterPct >= settings.budgetThreshold) {
      const today = new Date().toISOString().slice(0, 10);
      const id = `${BUDGET_PREFIX}${e.categoryId}:${Math.round(settings.budgetThreshold * 100)}:${today}`;
      const pct = Math.round(afterPct * 100);
      await fireImmediate(
        id,
        t('settings:notifications.budget.notifTitle', {
          categoryName: e.categoryName,
        }),
        t('settings:notifications.budget.notifBody', {
          categoryName: e.categoryName,
          percent: pct,
          spent: formatIDR(e.afterMinor, lang),
          limit: formatIDR(e.limitMinor, lang),
        }),
      );
    }
  }
}

/** Pre-write snapshot needed to detect a threshold crossing on tx commit. */
export type BudgetCrossEvent = {
  categoryId: string;
  categoryName: string;
  /** Spent in this category for this month BEFORE the new tx. */
  beforeMinor: number;
  /** Spent AFTER the new tx is applied. */
  afterMinor: number;
  /** Configured monthly limit for this category. */
  limitMinor: number;
};

function parseISODate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
