import type { Currency } from '@compass/shared-types';

import { i18next } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';

import { CURRENCY_META } from './currencyMeta';

/**
 * Format an integer-minor-units amount as a localised currency string.
 *
 * "Minor units" here means ×100 of display amount, uniform across all
 * supported currencies (ADR-06). So `5000` minor = $50.00 in USD, and
 * `1_000_000_00` minor = Rp 1.000.000 in IDR — same convention.
 *
 * Decimals follow the currency's display convention (IDR/JPY: 0,
 * everything else: 2), but for currencies where decimals=2 we drop them
 * when the cents portion is exactly zero — `$50.00` becomes `$50` to
 * keep the row tight. Cents always render when non-zero.
 *
 * Symbol prefix uses the metadata `symbol` field (Rp/$/S$/€/...). We
 * always prefix (vs Intl.NumberFormat's currency style) because the
 * Indonesian convention is "Rp 1.000.000" not the "Rp1.000.000" or
 * "1.000.000 Rp" the spec-compliant formatter produces.
 *
 * @example
 *   formatCurrency(1_000_000_00, 'IDR', 'id') // 'Rp 1.000.000'
 *   formatCurrency(5000,         'USD', 'en') // '$50'
 *   formatCurrency(5050,         'USD', 'en') // '$50.50'
 *   formatCurrency(150_000_000,  'JPY', 'id') // '¥1.500.000'
 */
export function formatCurrency(
  minorUnits: number,
  currency: Currency,
  locale?: Locale,
): string {
  const lang: Locale = locale ?? (isLocale(i18next.language) ? i18next.language : 'id');
  const meta = CURRENCY_META[currency];
  const major = minorUnits / 100;
  const hasCents = meta.decimals === 2 && Math.round(Math.abs(major) * 100) % 100 !== 0;
  const formatter = new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: meta.decimals,
  });
  return `${meta.symbol} ${formatter.format(major)}`;
}

function isLocale(value: string): value is Locale {
  return value === 'id' || value === 'en';
}
