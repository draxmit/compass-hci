import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme as useDeviceColorScheme, View } from 'react-native';

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
  // MMKV is synchronous, so we can read on first render — no flash of wrong theme.
  // On web, localStorage.getItem is also sync.
  const [mode, setModeState] = useState<ThemeMode>(() => readInitialMode());

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

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, resolvedScheme }),
    [mode, setMode, resolvedScheme],
  );

  // On web, sync the `dark` class to <html> so global.css body background
  // tracks the theme. The wrapper View itself stays transparent so the
  // AuroraBackdrop (z-index: -1) is visible above the body background but
  // below content.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolvedScheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedScheme]);

  // NativeWind reads the `dark` className at the root to flip dark: variants
  // throughout the tree. The wrapper View has no solid background — the body
  // (web) or root layout (native) provides the surface color, leaving room
  // for the AuroraBackdrop layer to be visible.
  return (
    <ThemeContext.Provider value={value}>
      <View className={`flex-1 ${resolvedScheme === 'dark' ? 'dark' : ''}`}>
        {children}
      </View>
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
