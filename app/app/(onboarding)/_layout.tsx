import { Stack } from 'expo-router';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';

/**
 * Onboarding stack — 4 ordered steps. Per ADR-11 the system back gesture
 * walks backward through steps; we let Stack provide that for free.
 *
 * Each screen is a fullScreen presentation (default) with no animation —
 * matches the snap-feel established by the rest of the app's modals.
 * Theme-aware contentStyle paints opaque on first frame so transitions
 * don't expose underlying surfaces.
 */
export default function OnboardingLayout() {
  const { resolvedScheme } = useTheme();
  const overlayBg =
    resolvedScheme === 'dark' ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        animationDuration: 0,
        contentStyle: { backgroundColor: overlayBg },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="budget-style" />
      <Stack.Screen name="account" />
      <Stack.Screen name="first-budget" />
    </Stack>
  );
}
