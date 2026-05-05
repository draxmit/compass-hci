import { LinearGradient } from 'expo-linear-gradient';
import { useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/shared/theme/useTheme';
import { tokens } from '@/shared/theme/tokens';
import type { AccentKey } from '@/shared/theme/tokens';

/**
 * Native PageBackdrop. Renders two static blob gradients in opposite corners
 * tinted with the active page's accent color. Static (no rotation, no
 * animation) per ADR-02 motion budget.
 *
 * The accent is derived from the active route segment via expo-router's
 * useSegments(). Crossfade between accents is handled at the layer above
 * (we just re-render with new colors).
 */
export function PageBackdrop() {
  const { resolvedScheme } = useTheme();
  const accent = useActiveAccent();
  // Light mode: accents wash to ~5% opacity so the page bg stays bright.
  // Dark mode: accents glow to ~25% so corners feel atmospheric.
  const opacityTopLeft = resolvedScheme === 'dark' ? 0.25 : 0.06;
  const opacityBottomRight = resolvedScheme === 'dark' ? 0.18 : 0.04;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        pointerEvents="none"
        colors={[`${accent}`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.7 }}
        style={[StyleSheet.absoluteFill, { opacity: opacityTopLeft }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', `${accent}`]}
        start={{ x: 0.3, y: 0.3 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: opacityBottomRight }]}
      />
    </View>
  );
}

function useActiveAccent(): string {
  const segments = useSegments();
  const map: Record<string, AccentKey> = {
    'index': 'dashboard',
    'transactions': 'transactions',
    'budgets': 'budgets',
    'insights': 'insights',
    'more': 'neutral',
  };
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && map[seg]) return tokens.accent[map[seg]];
  }
  return tokens.accent.dashboard;
}
