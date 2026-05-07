import type {
  Budget, BudgetGroup, Category, CategoryMonthTotal, Transaction,
} from '@compass/shared-types';

/**
 * 50/30/20 + envelope budget computations (ADR-21). Pure helpers —
 * no React, no Firestore. Caller passes already-loaded data; output
 * drives the /budgets screen renderers.
 */

/**
 * Read-layer normaliser for `Category.budgetGroup`. Legacy categories
 * (created pre-v2.0) don't have the field; we treat them as 'wants'
 * for 50/30/20 aggregation since 'needs' would over-count essentials
 * the user never tagged.
 */
export function resolveBudgetGroup(category: Pick<Category, 'budgetGroup'>): BudgetGroup {
  return category.budgetGroup ?? 'wants';
}

export type FiftyThirtyTwentyBucket = {
  group: BudgetGroup;
  /** Target percentage of income (0.5 / 0.3 / 0.2). */
  ratio: number;
  /** IDR-minor target (income × ratio), rounded. */
  targetMinor: number;
  /** IDR-minor sum of category_month_totals for categories tagged
   * with this group. */
  spentMinor: number;
};

/**
 * Compute the three buckets (Needs / Wants / Savings) for the active
 * month under the 50/30/20 budget style.
 *
 * @param monthIncomeMinor - sum of income transactions for the month,
 *   in IDR-minor. Drives the bucket targets via the 50/30/20 ratio.
 * @param totals - category_month_totals for the month, keyed however
 *   the caller has them (we just iterate).
 * @param categories - the workspace's categories list. budgetGroup is
 *   resolved for each.
 *
 * Spending in categories the user hasn't tagged (`budgetGroup === null`)
 * counts as 'wants' — see `resolveBudgetGroup`.
 *
 * Note for savings: traditional 50/30/20 expects savings to be set
 * aside, not spent. We use spending in 'savings'-tagged categories
 * (Investasi presets) as a proxy. v2.5 may also include goal
 * contributions when those land as real transactions.
 */
export function computeFiftyThirtyTwentyBuckets(
  monthIncomeMinor: number,
  totals: CategoryMonthTotal[],
  categories: Category[],
): FiftyThirtyTwentyBucket[] {
  const groupByCategoryId = new Map<string, BudgetGroup>(
    categories.map((c) => [c.id, resolveBudgetGroup(c)]),
  );
  const sums: Record<BudgetGroup, number> = { needs: 0, wants: 0, savings: 0 };
  for (const t of totals) {
    const group = groupByCategoryId.get(t.categoryId) ?? 'wants';
    sums[group] += t.totalIDR;
  }
  return [
    { group: 'needs',   ratio: 0.5, targetMinor: Math.round(monthIncomeMinor * 0.5), spentMinor: sums.needs   },
    { group: 'wants',   ratio: 0.3, targetMinor: Math.round(monthIncomeMinor * 0.3), spentMinor: sums.wants   },
    { group: 'savings', ratio: 0.2, targetMinor: Math.round(monthIncomeMinor * 0.2), spentMinor: sums.savings },
  ];
}

/**
 * Sum income transactions for a given month. Used to drive the
 * 50/30/20 bucket targets. Caller passes the recent-tx slice or a
 * one-shot listTransactions for the month; we just filter.
 */
export function sumMonthIncome(
  txs: Pick<Transaction, 'type' | 'amountIDR' | 'yearMonth'>[],
  yearMonth: string,
): number {
  return txs
    .filter((tx) => tx.type === 'income' && tx.yearMonth === yearMonth)
    .reduce((sum, tx) => sum + tx.amountIDR, 0);
}

export type EnvelopeBalance = {
  categoryId: string;
  /** Base limit set on this month's budget doc. */
  limitMinor: number;
  /** Carryover from last month: max(0, lastLimit - lastSpent).
   * Negative deficits do NOT carry forward — envelopes don't make
   * the user repay overspending; they reset to the base limit each
   * month plus any unspent surplus. */
  rolloverMinor: number;
  /** This month's spending so far (from category_month_totals). */
  spentMinor: number;
};

/**
 * Compute envelope balances for the active month. Pure-function over
 * (this-month budgets, last-month budgets, last-month totals,
 * this-month totals). Caller is responsible for the four data fetches
 * and passes them in.
 *
 * Carryover = max(0, last.limit - last.spent). Negative balances
 * (overspending) reset rather than carrying as debt — this mirrors
 * the YNAB envelope model and keeps the 'fresh start each month'
 * mental model.
 *
 * Returns a balance per category that has either:
 *   - a budget set this month, OR
 *   - a positive rollover from last month
 * Categories with neither are excluded (the renderer still groups
 * them under "Other categories").
 */
export function computeEnvelopeBalances(
  thisMonthBudgets: Budget[],
  lastMonthBudgets: Budget[],
  thisMonthTotals: CategoryMonthTotal[],
  lastMonthTotals: CategoryMonthTotal[],
): Map<string, EnvelopeBalance> {
  const lastBudgetByCat = new Map(lastMonthBudgets.map((b) => [b.categoryId, b]));
  const lastTotalByCat = new Map(lastMonthTotals.map((t) => [t.categoryId, t]));
  const thisTotalByCat = new Map(thisMonthTotals.map((t) => [t.categoryId, t]));

  const out = new Map<string, EnvelopeBalance>();
  // Walk this month's budgets first — every budgeted category gets
  // an envelope row.
  for (const b of thisMonthBudgets) {
    const lastB = lastBudgetByCat.get(b.categoryId);
    const lastT = lastTotalByCat.get(b.categoryId);
    const lastUnspent = lastB ? Math.max(0, lastB.limitMinor - (lastT?.totalIDR ?? 0)) : 0;
    out.set(b.categoryId, {
      categoryId: b.categoryId,
      limitMinor: b.limitMinor,
      rolloverMinor: lastUnspent,
      spentMinor: thisTotalByCat.get(b.categoryId)?.totalIDR ?? 0,
    });
  }
  // Also include any last-month budget that had unspent rollover but
  // isn't budgeted this month — the user still has access to that
  // surplus until they spend it.
  for (const lastB of lastMonthBudgets) {
    if (out.has(lastB.categoryId)) continue;
    const lastT = lastTotalByCat.get(lastB.categoryId);
    const lastUnspent = Math.max(0, lastB.limitMinor - (lastT?.totalIDR ?? 0));
    if (lastUnspent === 0) continue;
    out.set(lastB.categoryId, {
      categoryId: lastB.categoryId,
      limitMinor: 0,
      rolloverMinor: lastUnspent,
      spentMinor: thisTotalByCat.get(lastB.categoryId)?.totalIDR ?? 0,
    });
  }
  return out;
}
