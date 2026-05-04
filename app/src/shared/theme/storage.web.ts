// Web implementation: MMKV requires JSI which doesn't exist on web.
// Falls back to localStorage. Type signature mirrors storage.ts exactly.

export const themeStorage = {
  getString: (key: string): string | null =>
    typeof window !== 'undefined' ? window.localStorage.getItem(key) : null,
  setString: (key: string, value: string): void => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  },
};
