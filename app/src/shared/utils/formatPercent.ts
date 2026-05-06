import { i18next } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';

/**
 * Format a ratio as a percentage string with locale-aware decimal
 * separator and a trailing % sign. Always 1 decimal place; rounds
 * half-up.
 *
 * @example
 *   formatPercent(0.355, 'id')   // '35,5%'
 *   formatPercent(0.355, 'en')   // '35.5%'
 *   formatPercent(1.234, 'id')   // '123,4%' (allowed; budget-progress > 100 % is meaningful)
 *   formatPercent(0,     'id')   // '0,0%'
 *
 * Per ADR-10 §6 — used by budgets progress bars and the monthly summary
 * report's per-category breakdown.
 */
export function formatPercent(ratio: number, locale?: Locale): string {
  const lang: Locale = locale ?? (isLocale(i18next.language) ? i18next.language : 'id');
  const formatter = new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${formatter.format(ratio * 100)}%`;
}

function isLocale(value: string): value is Locale {
  return value === 'id' || value === 'en';
}
