import type { Currency } from '@compass/shared-types';

/**
 * Per-currency display metadata. Decimals here drives the input formatter
 * (`amountInput.ts`) and the display formatter (`formatCurrency`):
 * IDR/JPY display as whole numbers, everything else with two decimals.
 *
 * Symbol convention: a Latin-friendly prefix that prints inline next to the
 * amount. We deliberately use 'S$' / 'A$' (compact Asian-banking notation)
 * over 'SGD$' / 'AUD$' so balance rows stay narrow on mobile.
 *
 * Bilingual labels live here rather than in i18n JSON so the metadata is
 * a single self-contained registry — i18n keys would force a JSON round-trip
 * for every chip in the currency picker.
 */
export type CurrencyMeta = {
  code: Currency;
  symbol: string;
  /**
   * Display decimals — 0 for IDR/JPY, 2 elsewhere. Storage is always
   * ×100 minor units regardless of display decimals (uniform convention
   * across the codebase since T6 / ADR-06).
   */
  decimals: 0 | 2;
  label: { id: string; en: string };
};

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  IDR: { code: 'IDR', symbol: 'Rp',  decimals: 0, label: { id: 'Rupiah',          en: 'Indonesian Rupiah'  } },
  USD: { code: 'USD', symbol: '$',   decimals: 2, label: { id: 'Dolar AS',        en: 'US Dollar'          } },
  SGD: { code: 'SGD', symbol: 'S$',  decimals: 2, label: { id: 'Dolar Singapura', en: 'Singapore Dollar'   } },
  EUR: { code: 'EUR', symbol: '€',   decimals: 2, label: { id: 'Euro',            en: 'Euro'               } },
  AUD: { code: 'AUD', symbol: 'A$',  decimals: 2, label: { id: 'Dolar Australia', en: 'Australian Dollar'  } },
  JPY: { code: 'JPY', symbol: '¥',   decimals: 0, label: { id: 'Yen Jepang',      en: 'Japanese Yen'       } },
  GBP: { code: 'GBP', symbol: '£',   decimals: 2, label: { id: 'Pound',           en: 'British Pound'      } },
  MYR: { code: 'MYR', symbol: 'RM',  decimals: 2, label: { id: 'Ringgit',         en: 'Malaysian Ringgit'  } },
  THB: { code: 'THB', symbol: '฿',   decimals: 2, label: { id: 'Baht',            en: 'Thai Baht'          } },
  CNY: { code: 'CNY', symbol: 'CN¥', decimals: 2, label: { id: 'Yuan',            en: 'Chinese Yuan'       } },
};

/** Render order for the currency picker — IDR first, then by likelihood
 * for an Indonesian user (USD next, then close trading partners). */
export const CURRENCIES: Currency[] = [
  'IDR', 'USD', 'SGD', 'EUR', 'AUD', 'JPY', 'GBP', 'MYR', 'THB', 'CNY',
];

/** Truthy iff the input is a recognised currency code. Used by the read
 * layer to default missing/invalid currencies on legacy v1 docs to IDR. */
export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && value in CURRENCY_META;
}
