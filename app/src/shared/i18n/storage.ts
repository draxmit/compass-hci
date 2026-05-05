import AsyncStorage from '@react-native-async-storage/async-storage';

export type Locale = 'id' | 'en';

const STORAGE_KEY = 'i18n.locale';

export function isSupportedLocale(value: unknown): value is Locale {
  return value === 'id' || value === 'en';
}

/**
 * Read the persisted locale on web synchronously via localStorage; native
 * returns null and the caller falls back to detected/default until the async
 * preload finishes.
 */
export function readPersistedLocaleSync(): Locale | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isSupportedLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function readPersistedLocaleAsync(): Promise<Locale | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return isSupportedLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function persistLocale(locale: Locale): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, locale);
    // Best-effort sync mirror to localStorage on web for instant next-launch reads.
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, locale);
    }
  } catch {
    // Persistence failure is non-fatal — choice still applies for the session.
  }
}
