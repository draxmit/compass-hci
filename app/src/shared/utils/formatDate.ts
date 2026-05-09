import { i18next } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';

type DateStyle = 'long' | 'medium' | 'short' | 'long-month';

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
 *   formatDate(new Date('2026-05-05'), 'medium', 'id')      // '5 Mei 2026'
 *   formatDate(new Date('2026-05-05'), 'medium', 'en')      // 'May 5, 2026'
 *   formatDate(new Date('2026-05-05'), 'short', 'id')       // '05/05/2026'
 *   formatDate(new Date('2026-05-05'), 'long-month', 'id')  // 'Mei 2026'
 *   formatDate(new Date('2026-05-05'), 'long-month', 'en')  // 'May 2026'
 *
 * 'medium' uses the abbreviated month name when the locale supports it
 * (e.g. 'May 30, 2027' / '30 Mei 2027' — note Bahasa Indonesia keeps the
 * full month even in 'medium' since its ICU short form is identical).
 * Use 'medium' on space-constrained rows like the Dashboard goal pill
 * where 'long' would crowd amounts beside it.
 */
export function formatDate(d: Date, style: DateStyle = 'long', locale?: Locale): string {
  // Defensive: Intl.DateTimeFormat.format() throws "Invalid time value"
  // for a Date with NaN time. That used to crash the Dashboard when a
  // goal had a malformed targetDate (e.g. user typed "2027" alone in
  // the year input). Returning an empty string lets callers conditional-
  // render without a try/catch at every call site.
  if (Number.isNaN(d.getTime())) return '';
  const lang = locale ?? activeLocale();
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { year: 'numeric', month: 'long', day: 'numeric' }
      : style === 'medium'
        ? { year: 'numeric', month: 'short', day: 'numeric' }
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

/**
 * Compact "time until target" label for goal deadlines.
 *
 * Bucketed to glanceable units rather than exact day count:
 *   - past:           {past:true, label:'Past due' | 'Sudah lewat'}
 *   - today:          'Today' / 'Hari ini'
 *   - 1–28 days:      'in 8d' / '8 hari lagi'
 *   - 29–365 days:    'in 3mo' / '3 bulan lagi'
 *   - >365 days:      'in 2y' / '2 tahun lagi'
 *
 * Returns the past flag separately so callers can colour the label in
 * their own danger token rather than us hardcoding it. `dayCount` is
 * computed against local-midnight today vs local-midnight target so
 * "today" is a calendar-day check, not a 24-hour gap.
 *
 * @example
 *   formatTimeUntil('2026-05-15', 'id')   // {label:'8 hari lagi', past:false}
 *   formatTimeUntil('2024-01-01', 'en')   // {label:'Past due',   past:true}
 *   formatTimeUntil('2026-05-07', 'id')   // {label:'Hari ini',   past:false}
 */
export function formatTimeUntil(targetISO: string, locale?: Locale): { label: string; past: boolean } {
  const lang = locale ?? activeLocale();
  const target = new Date(`${targetISO}T00:00:00`);
  // Same defensive guard as formatDate — return a benign label for
  // garbage input rather than crashing downstream consumers.
  if (Number.isNaN(target.getTime())) {
    return { label: '', past: false };
  }
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - todayMidnight.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffDays < 0) {
    return { label: lang === 'id' ? 'Sudah lewat' : 'Past due', past: true };
  }
  if (diffDays === 0) {
    return { label: lang === 'id' ? 'Hari ini' : 'Today', past: false };
  }
  if (diffDays <= 28) {
    return {
      label: lang === 'id' ? `${diffDays} hari lagi` : `in ${diffDays}d`,
      past: false,
    };
  }
  if (diffDays <= 365) {
    const months = Math.round(diffDays / 30);
    return {
      label: lang === 'id' ? `${months} bulan lagi` : `in ${months}mo`,
      past: false,
    };
  }
  const years = Math.round(diffDays / 365);
  return {
    label: lang === 'id' ? `${years} tahun lagi` : `in ${years}y`,
    past: false,
  };
}
