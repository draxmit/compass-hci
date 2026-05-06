import { i18next } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';

/**
 * Format an integer-minor-units amount as a rupiah display string with the
 * active locale's separators. "Minor unit" here means 1/100 of a rupiah, so
 * `100050` minor units → `Rp 1.000,50` (id) or `Rp 1,000.50` (en).
 *
 * Decimals render only when the cents portion is non-zero — `100000` shows
 * as `Rp 1.000`, not `Rp 1.000,00`.
 *
 * Always prefixes "Rp" regardless of UI language (Indonesian convention).
 *
 * Storage as integer minor units is the project-wide rule per the master
 * plan ("Currency math: Integer minor units (no float)"); it future-proofs
 * for v2 multi-currency where USD/EUR cents are minor units too.
 *
 * @example
 *   formatIDR(1_000_000_00,    'id') // 'Rp 1.000.000'
 *   formatIDR(1_000_000_50,    'id') // 'Rp 1.000.000,50'
 *   formatIDR(1_000_000_00,    'en') // 'Rp 1,000,000'
 */
export function formatIDR(minorUnits: number, locale?: Locale): string {
  const lang: Locale = locale ?? (isLocale(i18next.language) ? i18next.language : 'id');
  const major = minorUnits / 100;
  const hasCents = Math.round(Math.abs(major) * 100) % 100 !== 0;
  const formatter = new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `Rp ${formatter.format(major)}`;
}

function isLocale(value: string): value is Locale {
  return value === 'id' || value === 'en';
}
