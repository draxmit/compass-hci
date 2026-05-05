import { i18next } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';

/**
 * Format an integer rupiah amount with the active locale's separators.
 * Always prefixes "Rp" — Indonesian convention regardless of UI language.
 *
 * @example
 *   formatIDR(12_400_000, 'id') // 'Rp 12.400.000'
 *   formatIDR(12_400_000, 'en') // 'Rp 12,400,000'
 */
export function formatIDR(amount: number, locale?: Locale): string {
  const lang: Locale = locale ?? (isLocale(i18next.language) ? i18next.language : 'id');
  const formatted = new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US').format(amount);
  return `Rp ${formatted}`;
}

function isLocale(value: string): value is Locale {
  return value === 'id' || value === 'en';
}
