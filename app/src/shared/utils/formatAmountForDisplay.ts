import type { Currency } from '@compass/shared-types';

import type { Locale } from '@/shared/i18n';

import { formatCurrency } from './formatCurrency';
import { formatIDR } from './formatIDR';
import { convertToIDRMinor } from './fxRates';

/**
 * Resolves how a foreign-currency amount should display, honouring the
 * user's `displayInIDR` preference (Settings toggle, ADR-19).
 *
 * Returns `{ primary, secondary }`:
 *  - For IDR amounts: `primary = formatIDR(...)`, `secondary = null`.
 *  - For non-IDR with toggle OFF: `primary = formatCurrency(in native)`,
 *    `secondary = null`. Identical to v2 launch behaviour.
 *  - For non-IDR with toggle ON: `primary = IDR-converted via FX`,
 *    `secondary = native amount` so the user can still see the
 *    source-of-truth balance. The subtitle is the call site's
 *    responsibility to render — keep secondary in muted text.
 *
 * Pure helper — no React, no hooks. Caller passes the resolved
 * `displayInIDR` boolean from `useUserDoc()` (or wherever).
 */
export function formatAmountForDisplay(
  amountMinor: number,
  currency: Currency,
  displayInIDR: boolean,
  locale?: Locale,
): { primary: string; secondary: string | null } {
  if (currency === 'IDR') {
    return { primary: formatIDR(amountMinor, locale), secondary: null };
  }
  if (displayInIDR) {
    const idrMinor = convertToIDRMinor(amountMinor, currency);
    return {
      primary: formatIDR(idrMinor, locale),
      secondary: formatCurrency(amountMinor, currency, locale),
    };
  }
  return {
    primary: formatCurrency(amountMinor, currency, locale),
    secondary: null,
  };
}
