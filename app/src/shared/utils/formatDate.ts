import { i18next } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';

type DateStyle = 'long' | 'short' | 'long-month';

const ICU_LOCALE: Record<Locale, string> = {
  id: 'id-ID',
  en: 'en-US',
};

function activeLocale(): Locale {
  const cur = i18next.language;
  return cur === 'id' || cur === 'en' ? cur : 'id';
}

/**
 * Format a Date in the active (or explicit) UI locale.
 *
 * @example
 *   formatDate(new Date('2026-05-05'), 'long', 'id')        // '5 Mei 2026'
 *   formatDate(new Date('2026-05-05'), 'long', 'en')        // 'May 5, 2026'
 *   formatDate(new Date('2026-05-05'), 'short', 'id')       // '05/05/2026'
 *   formatDate(new Date('2026-05-05'), 'long-month', 'id')  // 'Mei 2026'
 *   formatDate(new Date('2026-05-05'), 'long-month', 'en')  // 'May 2026'
 */
export function formatDate(d: Date, style: DateStyle = 'long', locale?: Locale): string {
  const lang = locale ?? activeLocale();
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : style === 'long-month'
        ? { year: 'numeric', month: 'long' }
        : { year: 'numeric', month: '2-digit', day: '2-digit' };
  return new Intl.DateTimeFormat(ICU_LOCALE[lang], options).format(d);
}

/**
 * Bucketed relative date label for activity rows ("kemarin" / "3 hari lalu" /
 * "yesterday" / "3 days ago"). Falls back to long format past 4 weeks.
 */
export function formatDateRelative(d: Date, locale?: Locale): string {
  const lang = locale ?? activeLocale();
  const rtf = new Intl.RelativeTimeFormat(ICU_LOCALE[lang], { numeric: 'auto' });
  const diffMs = d.getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (Math.abs(diffDays) >= 28) return formatDate(d, 'long', lang);
  if (Math.abs(diffDays) >= 7) return rtf.format(Math.round(diffDays / 7), 'week');
  return rtf.format(diffDays, 'day');
}
