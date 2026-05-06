import type { Locale } from '@/shared/i18n';

/**
 * Locale-aware currency input helpers, shared by every screen that
 * accepts an IDR amount (`/transaction/new`, `/transaction/[id]`,
 * `/accounts` initial-balance, `/budgets` limit, `/report` filters).
 *
 * Convention: the rest of the app stores amounts as integer minor
 * units (×100) per ADR-06's amendment. These helpers do the
 * locale-aware string ↔ minor-units conversion at the input boundary.
 *
 * - `id` locale → thousands `.` decimal `,` (e.g. `1.234.567,89`)
 * - `en` locale → thousands `,` decimal `.` (e.g. `1,234,567.89`)
 *
 * `formatAmountInput` runs on every keystroke (display); it strips
 * disallowed chars, applies thousands-separators, and clamps decimal
 * to 2 places.
 *
 * `parseAmountInput` converts the displayed string to integer minor
 * units for storage / formatIDR() consumption. Returns 0 for empty or
 * unparseable input — callers should treat 0 as "no amount entered".
 *
 * `minorToInputText` is the inverse — used to seed the input from a
 * stored value (NLP parser result, edit-existing-budget, etc).
 */

export function formatAmountInput(raw: string, locale: Locale): string {
  const decimalSep = locale === 'id' ? ',' : '.';
  const allowedRe = locale === 'id' ? /[^\d,]/g : /[^\d.]/g;
  const cleaned = raw.replace(allowedRe, '');
  const parts = cleaned.split(decimalSep);
  const intPart = parts[0] ?? '';
  let decPart = parts.length > 1 ? parts.slice(1).join('') : null;
  if (decPart !== null && decPart.length > 2) decPart = decPart.slice(0, 2);
  const formattedInt = intPart
    ? new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US').format(Number(intPart))
    : '';
  if (decPart === null) return formattedInt;
  return `${formattedInt}${decimalSep}${decPart}`;
}

export function parseAmountInput(formatted: string, locale: Locale): number {
  const decimalSep = locale === 'id' ? ',' : '.';
  const thousandsSep = locale === 'id' ? '.' : ',';
  const cleaned = formatted.split(thousandsSep).join('').replace(decimalSep, '.');
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function minorToInputText(minorUnits: number, locale: Locale): string {
  if (!minorUnits) return '';
  const major = minorUnits / 100;
  const intPart = Math.trunc(Math.abs(major));
  const cents = Math.round(Math.abs(minorUnits) - intPart * 100);
  const formattedInt = new Intl.NumberFormat(locale === 'id' ? 'id-ID' : 'en-US').format(intPart);
  if (cents === 0) return formattedInt;
  const decimalSep = locale === 'id' ? ',' : '.';
  return `${formattedInt}${decimalSep}${cents.toString().padStart(2, '0')}`;
}
