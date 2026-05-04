import {
  Barlow_300Light,
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  useFonts as useBarlow,
} from '@expo-google-fonts/barlow';
import {
  InstrumentSerif_400Regular_Italic,
  useFonts as useInstrumentSerif,
} from '@expo-google-fonts/instrument-serif';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useEffect, useMemo } from 'react';

import '../global.css';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { useTheme } from '@/shared/theme/useTheme';
import { AuroraBackdrop } from '@/shared/ui/AuroraBackdrop';
import { detectLowEndMode, useUiStore } from '@/stores/uiStore';

/**
 * Wrap React Navigation's theme so its built-in containers (Stack background,
 * Tabs scene background, etc.) render transparent. This lets the AuroraBackdrop
 * (rendered in the same tree at z-index: -1 on web, behind everything on
 * native) show through every screen instead of being covered by the default
 * `colors.background` paint.
 */
function NavigationLayer({ children }: { children: React.ReactNode }) {
  const { resolvedScheme } = useTheme();
  const navTheme = useMemo(() => {
    const base = resolvedScheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: 'transparent',
        card: 'transparent',
      },
    };
  }, [resolvedScheme]);
  return <NavThemeProvider value={navTheme}>{children}</NavThemeProvider>;
}

export default function RootLayout() {
  const [serifLoaded] = useInstrumentSerif({
    InstrumentSerif_400Regular_Italic,
  });
  const [sansLoaded] = useBarlow({
    Barlow_300Light,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
  });

  useEffect(() => {
    let cancelled = false;
    detectLowEndMode().then((value) => {
      if (!cancelled) useUiStore.getState().setLowEndMode(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!serifLoaded || !sansLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <NavigationLayer>
        <AuroraBackdrop variant="standard" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </NavigationLayer>
    </ThemeProvider>
  );
}
