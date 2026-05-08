import { listAccounts } from '@/services/firestore/accountsService';
import { listBudgets } from '@/services/firestore/budgetsService';
import { listCategories } from '@/services/firestore/categoriesService';
import { listMonthTotals } from '@/services/firestore/categoryMonthTotalsService';
import { listGoals } from '@/services/firestore/goalsService';
import { listTransactions } from '@/services/firestore/transactionsService';
import type { Locale } from '@/shared/i18n';
import { convertToIDRMinor } from '@/shared/utils/fxRates';

import type {
  ChatContext,
  ContextAccount,
  ContextBudget,
  ContextCategoryTotal,
  ContextGoal,
  ContextTransaction,
} from './types';

/**
 * Build a `ChatContext` snapshot for the Gemini chat assistant. Pulls
 * the user's full financial state in parallel and shapes it into the
 * Worker contract.
 *
 * **What's included:**
 *   - Total balance (IDR-equivalent, sums included accounts only)
 *   - All non-archived accounts with name + type + balance + currency
 *   - This-month budgets with their spent-vs-limit progress
 *   - All goals (sinking funds) with target / current / pin status
 *   - Last 90 days of transactions (typical: 50-200 records)
 *   - Last-90-days category totals for expense categories (rollup)
 *
 * **What's deliberately excluded:**
 *   - Archived accounts (irrelevant to current decisions)
 *   - Splits' breakdown (LLM doesn't need per-split detail; the rollup
 *     already covers per-category spend)
 *   - amountIDR — we send `amount` + `currency` and let the LLM
 *     reference Rp values from `categoryTotals90d` for cross-currency
 *     aggregation
 */
export async function buildContextSnapshot(
  wid: string,
  locale: Locale,
  pinnedGoalId: string | null = null,
): Promise<ChatContext> {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgoISO = isoDateNDaysAgo(90);
  const yearMonth = today.slice(0, 7);

  const [accounts, categories, budgets, goals, transactions, monthTotals] =
    await Promise.all([
      listAccounts(wid),
      listCategories(wid),
      listBudgets(wid, yearMonth),
      listGoals(wid),
      listTransactions(wid, { dateAfter: ninetyDaysAgoISO, orderByDate: true }),
      listMonthTotals(wid, yearMonth),
    ]);

  // Lookup table: categoryId → bilingual name in user's locale.
  const categoryNameById = new Map<string, string>();
  for (const c of categories) {
    categoryNameById.set(c.id, c.name[locale]);
  }

  // Lookup table: accountId → display name.
  const accountNameById = new Map<string, string>();
  for (const a of accounts) {
    accountNameById.set(a.id, a.name);
  }

  // Total balance (IDR-equivalent) — sum included accounts only,
  // converting non-IDR balances at the FX snapshot rate. Excluded
  // accounts (e.g. credit cards in net-worth-off mode) are skipped.
  let totalBalanceMinor = 0;
  for (const a of accounts) {
    if (!a.includedInNetWorth) continue;
    if (a.isArchived) continue;
    totalBalanceMinor += convertToIDRMinor(a.currentBalance, a.currency);
  }

  // Active (non-archived) accounts only.
  const ctxAccounts: ContextAccount[] = accounts
    .filter((a) => !a.isArchived)
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      balanceMinor: a.currentBalance,
      currency: a.currency,
    }));

  // This-month budgets joined with their spent totals from
  // category_month_totals (expense-only by data shape). The denormalised
  // total field is `totalIDR` (FX-converted at write-time per ADR-16).
  const spentByCategoryThisMonth = new Map<string, number>();
  for (const t of monthTotals) {
    spentByCategoryThisMonth.set(t.categoryId, t.totalIDR);
  }
  const ctxBudgets: ContextBudget[] = budgets.map((b) => ({
    categoryId: b.categoryId,
    categoryName: categoryNameById.get(b.categoryId) ?? '(unknown)',
    limitMinor: b.limitMinor,
    spentMinor: spentByCategoryThisMonth.get(b.categoryId) ?? 0,
  }));

  // Goals don't have an `isPinned` field — pinning is tracked on the
  // user doc as a single `pinnedGoalId` (ADR-20). The caller passes
  // it in so we can flag the right goal in the snapshot.
  const ctxGoals: ContextGoal[] = goals.map((g) => ({
    id: g.id,
    name: g.name,
    targetMinor: g.targetMinor,
    currentMinor: g.currentMinor,
    targetDate: g.targetDate,
    isPinned: pinnedGoalId !== null && g.id === pinnedGoalId,
  }));

  // Cap to 200 most-recent transactions even if the 90-day window had
  // more — extreme power-users would otherwise blow the token budget.
  // 200 txs × ~120 chars = 24k chars = ~6k tokens, comfortably
  // under Gemini Flash's 32k context window.
  const MAX_TXS = 200;
  const recentTxs = transactions.slice(0, MAX_TXS);
  const ctxTxs: ContextTransaction[] = recentTxs.map((t) => {
    // First split's category is treated as the canonical category for
    // multi-split txs (they'd get one row per split if we wanted to
    // surface every split, but the rollup totals already cover that).
    const firstSplit = t.splits?.[0];
    const categoryId = firstSplit?.categoryId ?? null;
    return {
      id: t.id,
      type: t.type,
      date: t.date,
      amountMinor: t.amount,
      currency: t.currency,
      categoryId,
      categoryName: categoryId ? categoryNameById.get(categoryId) ?? null : null,
      accountName: accountNameById.get(t.accountId) ?? '(unknown)',
      description: t.description,
      tags: t.tags ?? [],
    };
  });

  // 90-day per-category rollup — sum expenses (negative impact) by
  // category. Doesn't include income or transfers.
  const totalsByCategory = new Map<string, { sum: number; count: number }>();
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    for (const s of t.splits ?? []) {
      const prev = totalsByCategory.get(s.categoryId) ?? { sum: 0, count: 0 };
      // Use amountIDR for cross-currency consistency; multi-split
      // distribution: scale split's amount by the same currency it
      // was written in. Splits store major-currency amount; we
      // approximate by the split fraction × tx.amountIDR.
      const splitFraction = t.amount > 0 ? s.amount / t.amount : 0;
      const splitIDRMinor = Math.round(t.amountIDR * splitFraction);
      totalsByCategory.set(s.categoryId, {
        sum: prev.sum + splitIDRMinor,
        count: prev.count + 1,
      });
    }
  }
  const ctxCategoryTotals: ContextCategoryTotal[] = [...totalsByCategory.entries()]
    .map(([categoryId, { sum, count }]) => ({
      categoryId,
      categoryName: categoryNameById.get(categoryId) ?? '(unknown)',
      totalSpentMinor: sum,
      count,
    }))
    .sort((a, b) => b.totalSpentMinor - a.totalSpentMinor);

  return {
    locale,
    today,
    totalBalanceMinor,
    accounts: ctxAccounts,
    budgets: ctxBudgets,
    goals: ctxGoals,
    transactions: ctxTxs,
    categoryTotals90d: ctxCategoryTotals,
  };
}

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
