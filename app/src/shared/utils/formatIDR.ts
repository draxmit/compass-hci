import type { Locale } from '@/shared/i18n';

import { formatCurrency } from './formatCurrency';

/**
 * Format an IDR amount in minor units (×100). Thin wrapper around
 * {@link formatCurrency} preserved for the dozens of pre-multi-currency
 * call sites that hardcode "the IDR formatter". New code should call
 * `formatCurrency(minor, account.currency, locale)` directly when the
 * currency varies; this helper is for IDR-only contexts (e.g. budget
 * limits, monthly totals, dashboard "this month" — all IDR-denominated
 * via `amountIDR`).
 *
 * @example
 *   formatIDR(1_000_000_00, 'id') // 'Rp 1.000.000'
 *   formatIDR(1_000_000_50, 'id') // 'Rp 1.000.000,50'
 *   formatIDR(1_000_000_00, 'en') // 'Rp 1,000,000'
 */
export function formatIDR(minorUnits: number, locale?: Locale): string {
  return formatCurrency(minorUnits, 'IDR', locale);
}
