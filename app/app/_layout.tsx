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
import { Redirect, Stack, useSegments } from 'expo-router';
import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';

import '../global.css';
import { useAuthSubscription } from '@/services/firebase';
import { hydratePersistedLocale, initI18n } from '@/shared/i18n';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { AppShell } from '@/shared/ui/AppShell';
import { Splash } from '@/shared/ui/Splash';
import { useAuthLoading, useIsAuthed, useUserDoc } from '@/stores/authStore';
import { detectLowEndMode, useUiStore } from '@/stores/uiStore';

// Synchronous init at module load so the first render already has translations.
// Native first-launch hydrates the persisted choice asynchronously below.
initI18n();

/**
 * Wraps React Navigation's theme so its built-in containers render
 * transparent. PageBackdrop sits behind everything providing the page-accent
 * radial gradient.
 */
function NavigationLayer({ children }: { children: ReactNode }) {
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

/**
 * Stack tree. Profile and Settings get a theme-aware contentStyle so the
 * react-native-screens screen wrapper paints opaque immediately on push,
 * before the inner React tree mounts. Without this the (tabs) screen below
 * is briefly visible through the new screen even with animation: 'none'.
 */
function StackTree() {
  const { resolvedScheme } = useTheme();
  const overlayBg =
    resolvedScheme === 'dark' ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="profile"
        options={{
          presentation: 'fullScreenModal',
          animation: 'none',
          animationDuration: 0,
          contentStyle: { backgroundColor: overlayBg },
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          presentation: 'fullScreenModal',
          animation: 'none',
          animationDuration: 0,
          contentStyle: { backgroundColor: overlayBg },
        }}
      />
      <Stack.Screen
        name="categories"
        options={{
          presentation: 'fullScreenModal',
          animation: 'none',
          animationDuration: 0,
          contentStyle: { backgroundColor: overlayBg },
        }}
      />
      <Stack.Screen
        name="accounts"
        options={{
          presentation: 'fullScreenModal',
          animation: 'none',
          animationDuration: 0,
          contentStyle: { backgroundColor: overlayBg },
        }}
      />
      <Stack.Screen
        name="transaction/new"
        options={{
          presentation: 'fullScreenModal',
          animation: 'none',
          animationDuration: 0,
          contentStyle: { backgroundColor: overlayBg },
        }}
      />
      <Stack.Screen
        name="transaction/[id]"
        options={{
          presentation: 'fullScreenModal',
          animation: 'none',
          animationDuration: 0,
          contentStyle: { backgroundColor: overlayBg },
        }}
      />
      <Stack.Screen
        name="report/[yearMonth]"
        options={{
          presentation: 'fullScreenModal',
          animation: 'none',
          animationDuration: 0,
          contentStyle: { backgroundColor: overlayBg },
        }}
      />
    </Stack>
  );
}

/**
 * Global auth gate. Subscribes once to Firebase auth state, then redirects
 * unauthed users out of authed routes (and vice-versa). Renders <Splash/>
 * while we're still resolving the initial auth state to avoid a flash of
 * sign-in → tabs.
 *
 * T10 (ADR-11) added the onboarding redirect: authed users with
 * `onboardingComplete === false` get pushed to `/(onboarding)/welcome`
 * unless they're already inside the (onboarding) group. The user-doc is
 * subscribed by `useAuthSubscription` and mirrored into the auth store —
 * `null` while it's still loading, at which point we wait (no redirect)
 * to avoid bouncing the user mid-load.
 */
function AuthGate({ children }: { children: ReactNode }) {
  useAuthSubscription();
  const isLoading = useAuthLoading();
  const isAuthed = useIsAuthed();
  const userDoc = useUserDoc();
  const segments = useSegments();

  if (isLoading) {
    return <Splash />;
  }

  const inAuthGroup = segments[0] === '(auth)';
  const inOnboardingGroup = segments[0] === '(onboarding)';
  if (!isAuthed && !inAuthGroup) {
    return <Redirect href="/(auth)/sign-in" />;
  }
  if (isAuthed && inAuthGroup) {
    return <Redirect href="/(tabs)" />;
  }
  // Onboarding redirect — only fire once the user doc has loaded so we
  // don't bounce mid-fetch. If `userDoc` is null while signed in, the
  // subscription is still in flight; render Splash until it resolves.
  if (isAuthed && !userDoc) {
    return <Splash />;
  }
  if (
    isAuthed &&
    userDoc &&
    !userDoc.onboardingComplete &&
    !inOnboardingGroup
  ) {
    return <Redirect href="/(onboarding)/welcome" />;
  }
  // Conversely: a user who's completed onboarding but lands inside the
  // (onboarding) group (e.g., back-navigated) gets bounced to /tabs.
  if (isAuthed && userDoc?.onboardingComplete && inOnboardingGroup) {
    return <Redirect href="/(tabs)" />;
  }
  return <>{children}</>;
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

  useEffect(() => {
    // AsyncStorage hydration only matters on native first launch — web's sync
    // localStorage read in initI18n() already returned the persisted choice.
    void hydratePersistedLocale();
  }, []);

  // Surface font load errors in dev — `null` would leave a permanently blank
  // screen. Render fallback children once we've either loaded or errored.
  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <ThemeProvider>
      <NavigationLayer>
        <AppShell>
          <AuthGate>
            <StackTree />
          </AuthGate>
        </AppShell>
      </NavigationLayer>
    </ThemeProvider>
  );
}
