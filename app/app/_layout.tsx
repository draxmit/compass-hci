import { GeistMono_400Regular, GeistMono_500Medium, GeistMono_700Bold } from '@expo-google-fonts/geist-mono';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect, useMemo } from 'react';

import '../global.css';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { useTheme } from '@/shared/theme/useTheme';
import { AppShell } from '@/shared/ui/AppShell';
import { PageBackdrop } from '@/shared/ui/PageBackdrop';
import { detectLowEndMode, useUiStore } from '@/stores/uiStore';

/**
 * Wraps React Navigation's theme so its built-in containers render
 * transparent. PageBackdrop sits behind everything providing the page-accent
 * radial gradient.
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
  // Single useFonts call — combining both families. Two parallel useFonts
  // hooks have shown races on React 19; one map is more reliable.
  const [fontsLoaded, fontsError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_700Bold,
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

  // Surface font load errors in dev — `null` would leave a permanently blank
  // screen. Render fallback children once we've either loaded or errored.
  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <ThemeProvider>
      <NavigationLayer>
        <PageBackdrop />
        <AppShell>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="insights" options={{ presentation: 'card' }} />
          </Stack>
        </AppShell>
      </NavigationLayer>
    </ThemeProvider>
  );
}
