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

  // NativeWind reads the `dark` className at the root to flip dark: variants
  // throughout the tree. We also set the absolute-fill background here so the
  // root has a defined surface color even before children render.
  return (
    <ThemeContext.Provider value={value}>
      <View
        className={`flex-1 ${resolvedScheme === 'dark' ? 'dark bg-surface-dark-bg' : 'bg-surface-light-bg'}`}
      >
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
