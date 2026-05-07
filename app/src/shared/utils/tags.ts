import type { Transaction } from '@compass/shared-types';

/**
 * Tag normalisation rules (ADR-17):
 *  - lowercased so `Lebaran` and `lebaran` collapse
 *  - leading/trailing whitespace trimmed
 *  - internal whitespace collapsed to single hyphens
 *    (`work trip` → `work-trip`)
 *  - non-alphanumeric chars dropped, except hyphens and `_`
 *
 * Caller (TagsInput) calls this on every commit so storage stays
 * normalised; downstream readers (filter chips, badges) can
 * compare strings directly.
 *
 * Returns the empty string for entirely-stripped input — caller
 * should drop empty strings from the array.
 */
export function normaliseTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalise + dedupe in one shot. Used at the input boundary on
 * /transaction/new + /transaction/[id] so the array we hand to the
 * service is clean.
 */
export function normaliseTagList(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const n = normaliseTag(r);
    if (n.length > 0 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Collect all unique tags across a transaction set, with usage counts
 * (descending). Used by the autocomplete suggestions on TagsInput and
 * the multi-select filter on /transactions. O(n × avg tags); n is the
 * loaded tx slice so this is cheap.
 */
export function collectTagFrequencies(
  txs: Pick<Transaction, 'tags'>[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tx of txs) {
    if (!Array.isArray(tx.tags)) continue;
    for (const tag of tx.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return new Map(
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}
