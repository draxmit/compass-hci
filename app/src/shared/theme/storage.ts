import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Theme persistence on native. Originally used react-native-mmkv (sync, fast)
 * but Expo Go doesn't include MMKV's native binding, so MMKV crashes on
 * Expo Go regardless of v2 vs v3. We use AsyncStorage (which Expo Go DOES
 * include) backed by an in-memory cache so the sync getString/setString
 * surface stays the same.
 *
 * Trade-off: a cold-start mode read returns null until `loadAsync` finishes.
 * ThemeProvider calls `loadAsync` on mount and updates state, so the
 * worst-case flash of default theme → user-saved theme is ~50-100ms.
 */
const memCache: Record<string, string | null> = {};

export const themeStorage = {
  getString(key: string): string | null {
    return memCache[key] ?? null;
  },
  setString(key: string, value: string): void {
    memCache[key] = value;
    // Fire-and-forget — failures are non-fatal (worst case: theme doesn't persist).
    AsyncStorage.setItem(key, value).catch(() => {});
  },
  async loadAsync(key: string): Promise<string | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value !== null) memCache[key] = value;
      return value;
    } catch {
      return null;
    }
  },
};
