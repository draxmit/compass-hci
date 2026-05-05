import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme as useDeviceColorScheme, View } from 'react-native';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';

import { themeStorage } from './storage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedScheme: ResolvedScheme;
};

const STORAGE_KEY = 'theme.mode';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readInitialMode(): ThemeMode {
  const raw = themeStorage.getString(STORAGE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Sync read works on web (localStorage) and from in-memory cache once
  // populated. On native first launch the cache is empty — we kick off an
  // async load below and update state if a saved value differs from the
  // default. Worst-case flash: ~100ms.
  const [mode, setModeState] = useState<ThemeMode>(() => readInitialMode());

  // NativeWind 4 with `darkMode: 'class'` requires its own setColorScheme()
  // to flip dark: variants on native (the React-tree `dark` className alone
  // isn't enough — that's a web-only CSS thing). We push the resolved theme
  // into NativeWind's color-scheme store so dark: utilities resolve
  // correctly across native + web.
  const { setColorScheme } = useNativeWindColorScheme();

  // Native: hydrate from AsyncStorage on mount.
  useEffect(() => {
    if (typeof document !== 'undefined') return; // web is sync, no preload needed
    void (async () => {
      const { themeStorage: store } = await import('./storage');
      if (typeof store.loadAsync === 'function') {
        const value = await store.loadAsync(STORAGE_KEY);
        if (value === 'light' || value === 'dark' || value === 'system') {
          setModeState(value);
        }
      }
    })();
  }, []);

  const deviceScheme = useDeviceColorScheme();

  const resolvedScheme: ResolvedScheme = useMemo(() => {
    if (mode === 'system') {
      return deviceScheme === 'dark' ? 'dark' : 'light';
    }
    return mode;
  }, [mode, deviceScheme]);

  const setMode = useMemo(
    () => (next: ThemeMode) => {
      setModeState(next);
      themeStorage.setString(STORAGE_KEY, next);
    },
    [],
  );

  // Keep persisted value in sync if state ever updates outside of setMode.
  useEffect(() => {
    themeStorage.setString(STORAGE_KEY, mode);
  }, [mode]);

  // Sync NativeWind's color scheme on every resolvedScheme change — drives
  // dark: utility resolution on BOTH web and native. (On web NativeWind also
  // honors the html.dark class we set below, but using setColorScheme here
  // is the canonical path.)
  useEffect(() => {
    setColorScheme(resolvedScheme);
  }, [resolvedScheme, setColorScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, resolvedScheme }),
    [mode, setMode, resolvedScheme],
  );

  // On web only, also toggle the `dark` class on <html> so global.css body
  // backgrounds track the theme (those are plain CSS, not NativeWind).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolvedScheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedScheme]);

  return (
    <ThemeContext.Provider value={value}>
      <View className="flex-1">{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeContext must be used inside <ThemeProvider>');
  }
  return ctx;
}
