import type { Currency } from '@compass/shared-types';

/**
 * Hardcoded foreign-currency → IDR rate table.
 *
 * Snapshot date: 2026-05-07. v2.1 will swap this constant for a daily
 * `https://api.exchangerate.host/latest?base=IDR` pull cached in MMKV +
 * a 24-hour TTL. v2.0 ships static rates so the feature works zero-cost,
 * fully offline, and without a third-party dependency or rate-limiting
 * concern. The trade-off (rates drift over weeks/months) is acceptable
 * for personal-finance directional reporting; the user always sees the
 * raw amount in the account's native currency on the account row, so
 * stale FX never silently misrepresents the source-of-truth balance.
 *
 * The rate is "IDR per 1 unit of foreign". For non-IDR amounts:
 *   amountIDR_minor = amountForeign_minor × FX_TO_IDR[foreign]
 *
 * Storage convention is uniform ×100 minor units across all currencies
 * (see ADR-06). For IDR/JPY whose display decimals are 0, the ×100
 * convention still applies internally — the formatter handles the
 * display rounding. So the rate constant is plain: 1 USD = Rp 16,500
 * means USD-minor 5000 ($50.00) × 16500 = 82,500,000 IDR-minor (Rp 825,000).
 *
 * Rates are sourced from Bank Indonesia's published reference rates
 * for the snapshot date, rounded to the nearest 50 IDR for stability.
 */
export const FX_TO_IDR: Record<Exclude<Currency, 'IDR'>, number> = {
  USD: 16500,
  SGD: 12300,
  EUR: 17800,
  AUD: 10800,
  JPY: 110,
  GBP: 20800,
  MYR: 3700,
  THB: 470,
  CNY: 2300,
};

/**
 * Convert an amount in `currency` (×100 minor units) to its IDR-minor
 * equivalent at the snapshot rate. IDR passes through unchanged.
 *
 * Used at transaction-write time to compute `amountIDR` (stored on the
 * tx so historical reports remain stable) and at dashboard read time
 * to convert non-IDR account balances for the net-worth sum.
 */
/**
 * Read the most-recently-loaded rate for `currency`. Prefers the
 * live cache (populated post-sign-in by services/fxRatesLive.ts);
 * falls back to the static snapshot when the live cache is empty
 * or doesn't have the currency yet.
 *
 * Wrapped in try/catch + dynamic require to keep this util portable
 * (the seed script + worker code import it without dragging in the
 * AsyncStorage-bound live service). Sync read — never blocks.
 */
function rateFor(currency: Exclude<Currency, 'IDR'>): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const live = (require('@/services/fxRatesLive') as {
      getLiveOrFallbackRates?: () => { rates: Partial<Record<Exclude<Currency, 'IDR'>, number>> };
    }).getLiveOrFallbackRates?.();
    if (live && live.rates[currency]) {
      return live.rates[currency] as number;
    }
  } catch {
    /* fxRatesLive not available — happens in node scripts */
  }
  return FX_TO_IDR[currency];
}

export function convertToIDRMinor(amountMinor: number, currency: Currency): number {
  if (currency === 'IDR') return amountMinor;
  return Math.round(amountMinor * rateFor(currency));
}

/**
 * Inverse: convert an IDR-minor amount into `currency`'s minor units.
 * Used when the user enters a value in IDR (e.g. goal contribution
 * amount) but the underlying source-account balance is denominated
 * in a foreign currency — without this conversion the deduction
 * would be applied 1:1 against the foreign-cents balance, sending
 * the account hilariously negative (Rp 50jt = 5 billion USD-cents).
 */
export function convertFromIDRMinor(amountIDRMinor: number, currency: Currency): number {
  if (currency === 'IDR') return amountIDRMinor;
  return Math.round(amountIDRMinor / rateFor(currency));
}
