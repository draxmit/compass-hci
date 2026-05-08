import type { Budget, Category, Goal } from '@compass/shared-types';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { subscribeBudgets } from '@/services/firestore/budgetsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import { subscribeMonthTotals } from '@/services/firestore/categoryMonthTotalsService';
import { subscribeGoals } from '@/services/firestore/goalsService';
import {
  notificationsSupported,
  cancelAllScheduled,
} from '@/services/notifications';
import type { Locale } from '@/shared/i18n';
import { useAuthUser, useUserDoc } from '@/stores/authStore';

import {
  checkBudgetAlerts,
  readSettings,
  syncDailyReminder,
  syncGoalReminders,
} from './scheduler';
import type { BudgetCrossEvent } from './scheduler';

/**
 * Mounted once at the AuthGate level when the user is authed. Watches
 * the relevant Firestore subscriptions and:
 *
 *   - Reschedules the daily logging reminder when settings change
 *   - Reschedules goal-deadline reminders when goals or settings change
 *   - Fires immediate budget-alert notifications when a tx pushes a
 *     category total across the configured threshold
 *
 * All reminders are LOCAL — no server-side push, no FCM. The trade-off
 * vs cron-based server notifications is that reminders only fire on
 * devices that have opened the app at least once (so the local schedule
 * is registered with the OS); that's acceptable for an active
 * money-tracking app.
 *
 * On sign-out the parent unmounts this hook; the cleanup effect cancels
 * the user's pending notifications so the next signed-in user doesn't
 * inherit them.
 */
export function useNotificationSync() {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const userDoc = useUserDoc();
  const wid = user ? `solo-${user.uid}` : null;

  const goalsRef = useRef<Goal[]>([]);
  const budgetsRef = useRef<Budget[]>([]);
  const categoriesRef = useRef<Category[]>([]);
  const lastTotalsRef = useRef<Map<string, number>>(new Map());

  // Subscribe to data needed for reminder scheduling + budget alerts.
  useEffect(() => {
    if (!notificationsSupported || !wid) return;
    const yearMonth = new Date().toISOString().slice(0, 7);

    const unsubGoals = subscribeGoals(wid, (goals) => {
      goalsRef.current = goals;
      const settings = readSettings(userDoc);
      void syncGoalReminders(settings, goals, t, lang);
    });

    const unsubBudgets = subscribeBudgets(wid, yearMonth, (budgets) => {
      budgetsRef.current = budgets;
    });

    const unsubCategories = subscribeCategories(wid, (cats) => {
      categoriesRef.current = cats;
    });

    const unsubTotals = subscribeMonthTotals(wid, yearMonth, (totals) => {
      const settings = readSettings(userDoc);
      // Build the cross-event list using the previous-snapshot ref vs
      // the new totals. First subscription emit just primes the ref —
      // we don't fire alerts on the initial load (they'd retroactively
      // notify about txs the user already knows about).
      const events: BudgetCrossEvent[] = [];
      const isFirstEmit = lastTotalsRef.current.size === 0;
      const newMap = new Map<string, number>();
      for (const t of totals) {
        newMap.set(t.categoryId, t.totalIDR);
      }
      if (!isFirstEmit) {
        for (const [categoryId, afterMinor] of newMap.entries()) {
          const beforeMinor = lastTotalsRef.current.get(categoryId) ?? 0;
          if (afterMinor === beforeMinor) continue;
          // Look up budget + category metadata for the alert text.
          const budget = budgetsRef.current.find(
            (b) => b.categoryId === categoryId,
          );
          if (!budget || budget.limitMinor <= 0) continue;
          const cat = categoriesRef.current.find((c) => c.id === categoryId);
          if (!cat) continue;
          events.push({
            categoryId,
            categoryName: cat.name[lang],
            beforeMinor,
            afterMinor,
            limitMinor: budget.limitMinor,
          });
        }
      }
      lastTotalsRef.current = newMap;
      if (events.length > 0) {
        void checkBudgetAlerts(settings, events, t, lang);
      }
    });

    return () => {
      unsubGoals();
      unsubBudgets();
      unsubCategories();
      unsubTotals();
    };
    // userDoc intentionally NOT in deps — settings reads off the latest
    // userDoc via closure, but we don't want to re-subscribe every time
    // the user toggles a flag (would lose the lastTotals snapshot).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid, lang, t]);

  // Resync daily + goal reminders whenever the user's settings change.
  // Goals are read off the ref so we don't have to thread them through
  // a separate effect — the goals subscription above repopulates the
  // ref before this fires (subscriptions are sync emit-on-mount).
  useEffect(() => {
    if (!notificationsSupported || !userDoc) return;
    const settings = readSettings(userDoc);
    void syncDailyReminder(settings, t);
    void syncGoalReminders(settings, goalsRef.current, t, lang);
  }, [userDoc, lang, t]);

  // Cleanup on sign-out — cancel everything we scheduled so the next
  // user (e.g. account-switch on a shared device) doesn't inherit
  // reminders.
  useEffect(() => {
    if (!user && !userDoc && notificationsSupported) {
      void cancelAllScheduled();
    }
  }, [user, userDoc]);
}
