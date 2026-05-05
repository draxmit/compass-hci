import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import authEn from '../../../locales/en/auth.json';
import budgetsEn from '../../../locales/en/budgets.json';
import commonEn from '../../../locales/en/common.json';
import dashboardEn from '../../../locales/en/dashboard.json';
import settingsEn from '../../../locales/en/settings.json';
import transactionsEn from '../../../locales/en/transactions.json';
import authId from '../../../locales/id/auth.json';
import budgetsId from '../../../locales/id/budgets.json';
import commonId from '../../../locales/id/common.json';
import dashboardId from '../../../locales/id/dashboard.json';
import settingsId from '../../../locales/id/settings.json';
import transactionsId from '../../../locales/id/transactions.json';

import { isSupportedLocale, readPersistedLocaleAsync, readPersistedLocaleSync } from './storage';
import type { Locale } from './storage';

const NAMESPACES = ['common', 'auth', 'dashboard', 'transactions', 'budgets', 'settings'] as const;

const resources = {
  id: {
    common: commonId,
    auth: authId,
    dashboard: dashboardId,
    transactions: transactionsId,
    budgets: budgetsId,
    settings: settingsId,
  },
  en: {
    common: commonEn,
    auth: authEn,
    dashboard: dashboardEn,
    transactions: transactionsEn,
    budgets: budgetsEn,
    settings: settingsEn,
  },
} as const;

/**
 * Resolve initial language: persisted (sync read on web) → device-detected → 'id'.
 * Async-persisted hydration runs after init via `hydratePersistedLocale()`.
 */
function resolveInitialLocale(): Locale {
  const persisted = readPersistedLocaleSync();
  if (persisted) return persisted;
  const device = getLocales()[0]?.languageCode;
  if (isSupportedLocale(device)) return device;
  return 'id';
}

let initialised = false;

export function initI18n(): typeof i18next {
  if (initialised) return i18next;
  initialised = true;

  const lng = resolveInitialLocale();

  void i18next.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'id',
    ns: NAMESPACES as unknown as string[],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    returnNull: false,
  });

  return i18next;
}

/**
 * Hydrate the persisted locale from AsyncStorage post-init. Native first
 * launch goes through this; web reads sync from localStorage and skips.
 */
export async function hydratePersistedLocale(): Promise<void> {
  const persisted = await readPersistedLocaleAsync();
  if (persisted && persisted !== i18next.language) {
    await i18next.changeLanguage(persisted);
  }
}

export { i18next };
export type { Locale };
