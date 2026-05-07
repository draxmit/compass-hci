import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Boolean-flag persistence backed by Expo SecureStore (ADR-12 §2). Use for
 * per-device flags that should survive app restart but never leave the
 * device — e.g. the encrypted-cache toggle, biometric override, etc.
 *
 * SecureStore is string-only; we serialise as 'true'/'false'. Both calls
 * are async because SecureStore on native (Keychain / EncryptedSharedPrefs)
 * is async.
 *
 * On web SecureStore is unavailable — there's no platform-native secure
 * storage in the browser. We fall back to localStorage which is NOT
 * encrypted; v3 should reconsider this when the feature actually enforces
 * something. For v1 the flag is just a UI state placeholder.
 */

/** v1's known flag keys. Add new ones here so the call sites stay typed. */
export type SecureFlagKey = 'compass.encryptedCache.enabled';

const WEB_PREFIX = '__compass_secure__';

export async function getFlag(key: SecureFlagKey): Promise<boolean> {
  if (Platform.OS === 'web') {
    // localStorage may be undefined in older private-mode contexts.
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(`${WEB_PREFIX}${key}`) === 'true';
  }
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw === 'true';
  } catch (err) {
    console.warn('[secureFlags] read failed', key, err);
    return false;
  }
}

export async function setFlag(key: SecureFlagKey, value: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(`${WEB_PREFIX}${key}`, value ? 'true' : 'false');
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value ? 'true' : 'false');
  } catch (err) {
    console.warn('[secureFlags] write failed', key, err);
  }
}
