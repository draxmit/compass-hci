import type { Transaction } from '@compass/shared-types';

export type RecurringExpense = {
  /** Stable id derived from merchant + rounded amount, suitable as a React key. */
  id: string;
  /** Best-guess merchant label (truncated description from the most recent occurrence). */
  merchant: string;
  /** Average amount in IDR minor units across the matched occurrences. */
  averageAmountMinor: number;
  /** Estimated annual cost (averageAmountMinor × 12 — assumes monthly cadence). */
  annualCostMinor: number;
  /** Number of detected occurrences in the window. */
  occurrenceCount: number;
  /** ISO date of the earliest detected occurrence in the window (`YYYY-MM-DD`). */
  earliestDate: string;
  /** ISO date of the most recent detected occurrence in the window. */
  latestDate: string;
  /** Distinct yearMonth values the occurrences span (e.g. ['2026-02', '2026-03', ...]). */
  monthsSeen: string[];
  /** All matched transaction ids — useful for routing the user into a filtered list. */
  transactionIds: string[];
};

/**
 * Normalise a transaction description into a comparable merchant key.
 * Stripping punctuation + lowercasing + collapsing whitespace lets
 * "Netflix subscription" and "NETFLIX SUBSCR." land in the same bucket.
 */
function normaliseMerchant(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pick a human-readable merchant label from a normalised key. We use
 * the first 3 tokens, capitalised, as a stable display name. Falls
 * back to the raw description from the most recent occurrence if the
 * key is empty (e.g. user logged a tx without description).
 */
function pickDisplayMerchant(rawDescriptions: string[]): string {
  const recent = rawDescriptions[0]?.trim();
  if (recent) {
    // Cap at ~32 chars so the row doesn't break the layout.
    return recent.length > 32 ? recent.slice(0, 32).trim() + '…' : recent;
  }
  return '(unnamed)';
}

const AMOUNT_BUCKET_PCT = 0.10;   // ±10% — same Netflix can shift slightly across months
const MIN_OCCURRENCES = 3;
const MIN_DISTINCT_MONTHS = 3;

/**
 * Detect recurring expenses from a transaction list. Heuristic:
 *
 *   1. Filter to expenses only (income + transfers excluded).
 *   2. Bucket by (normalised merchant key, amount within ±10%).
 *   3. Keep buckets with ≥3 occurrences across ≥3 DISTINCT months
 *      — single-month duplicates (e.g. multiple grocery runs) are
 *      filtered out because they aren't recurring.
 *   4. Sort by averageAmountMinor descending so the biggest leaks
 *      surface first.
 *
 * Trade-offs:
 *   - False positives possible for small consistent expenses (e.g.
 *     daily Rp 7k parkir). The 3-month requirement filters most
 *     single-event noise; a future improvement could add a min-amount
 *     floor or weight by occurrence-frequency variance.
 *   - False negatives for subscriptions whose price increased
 *     mid-window (Netflix bumped from Rp 169k → Rp 199k splits the
 *     bucket). Acceptable for v1 — the user still sees both halves
 *     as separate recurrings.
 *
 * Cost: O(n log n) where n = transactions in the window.
 */
export function detectRecurringExpenses(
  txs: Transaction[],
  options: { minOccurrences?: number; minDistinctMonths?: number } = {},
): RecurringExpense[] {
  const minOcc = options.minOccurrences ?? MIN_OCCURRENCES;
  const minMonths = options.minDistinctMonths ?? MIN_DISTINCT_MONTHS;

  // Bucket by merchant key first, then within each merchant cluster
  // sub-bucket by amount tier (±10% of the seed). Two-pass keeps the
  // matching tolerant of small price drift without merging amounts
  // from different services that happen to share a merchant prefix.
  type Occurrence = { tx: Transaction; rawDescription: string };
  const byMerchant = new Map<string, Occurrence[]>();

  for (const tx of txs) {
    if (tx.type !== 'expense') continue;
    if (!tx.description || tx.amountIDR <= 0) continue;
    const key = normaliseMerchant(tx.description);
    if (!key) continue;
    const list = byMerchant.get(key) ?? [];
    list.push({ tx, rawDescription: tx.description });
    byMerchant.set(key, list);
  }

  const out: RecurringExpense[] = [];
  for (const [merchantKey, occs] of byMerchant) {
    if (occs.length < minOcc) continue;
    // Sub-bucket by amount tier — within each merchant, amounts
    // within ±10% of a seed land together. Greedy clustering: walk
    // sorted amounts, start a new bucket when the gap exceeds 10%.
    const sortedByAmount = [...occs].sort((a, b) => a.tx.amountIDR - b.tx.amountIDR);
    const buckets: Occurrence[][] = [];
    for (const o of sortedByAmount) {
      const last = buckets[buckets.length - 1];
      if (last) {
        const seedAmount = last[0]!.tx.amountIDR;
        const tolerance = seedAmount * AMOUNT_BUCKET_PCT;
        if (Math.abs(o.tx.amountIDR - seedAmount) <= tolerance) {
          last.push(o);
          continue;
        }
      }
      buckets.push([o]);
    }
    for (const bucket of buckets) {
      if (bucket.length < minOcc) continue;
      const monthsSeen = Array.from(new Set(bucket.map((b) => b.tx.yearMonth))).sort();
      if (monthsSeen.length < minMonths) continue;
      // Sort matches by date desc so latest is at index 0.
      const sortedByDate = [...bucket].sort((a, b) => b.tx.date.localeCompare(a.tx.date));
      const total = bucket.reduce((s, b) => s + b.tx.amountIDR, 0);
      const avg = Math.round(total / bucket.length);
      out.push({
        id: `${merchantKey}-${avg}`,
        merchant: pickDisplayMerchant(sortedByDate.map((b) => b.rawDescription)),
        averageAmountMinor: avg,
        annualCostMinor: avg * 12,
        occurrenceCount: bucket.length,
        earliestDate: sortedByDate[sortedByDate.length - 1]!.tx.date,
        latestDate: sortedByDate[0]!.tx.date,
        monthsSeen,
        transactionIds: bucket.map((b) => b.tx.id),
      });
    }
  }
  // Largest monthly cost first — biggest leaks surface at the top.
  out.sort((a, b) => b.averageAmountMinor - a.averageAmountMinor);
  return out;
}
