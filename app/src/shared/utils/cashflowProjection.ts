/**
 * Predictive cash-flow helper (v3 phase A — 2).
 *
 * Pure function, no Firestore reads. Takes the current month's running
 * total + the day of the month and projects what the end-of-month
 * total will look like at the user's current pace.
 *
 * Linear extrapolation: assumes the remainder of the month spends at
 * the same daily rate as the days so far. Good enough for "are we on
 * track?" — we're not building a stochastic forecaster, just a glance
 * cue. Variance / confidence band deferred to v3.5.
 *
 * Returns null when the projection would be too noisy to trust:
 *   - day of month < 7 (less than a week of data — high variance)
 *   - the projection is identical to the running total (final day —
 *     showing 'projected' alongside the realised value is misleading)
 */

export type CashflowProjection = {
  /** Projected end-of-month total in IDR minor units. */
  projectedMinor: number;
  /** Days that have elapsed in the current month so far (1..31). */
  daysElapsed: number;
  /** Total days in the current month (28..31). */
  totalDays: number;
  /** Days remaining including today. */
  daysRemaining: number;
};

/**
 * Compute end-of-month projection for a running monthly total.
 *
 * @param currentMinor    Running total spent so far this month, in
 *                        minor units (×100). Same shape as
 *                        `category_month_totals` totalIDR.
 * @param now             Reference point — usually `new Date()`.
 *                        Injectable for tests.
 * @param minDaysOfData   Floor for trustworthiness. Defaults to 7. If
 *                        the month is younger than this, returns null.
 */
export function computeCashflowProjection(
  currentMinor: number,
  now: Date = new Date(),
  minDaysOfData = 7,
): CashflowProjection | null {
  const daysElapsed = now.getDate();
  // Total days in the current month — JS trick: day 0 of next month
  // is the last day of this month.
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  if (daysElapsed < minDaysOfData) return null;
  if (daysRemaining === 0) return null;
  if (currentMinor <= 0) return null;

  const dailyRate = currentMinor / daysElapsed;
  const projectedMinor = Math.round(dailyRate * totalDays);

  return { projectedMinor, daysElapsed, totalDays, daysRemaining };
}
