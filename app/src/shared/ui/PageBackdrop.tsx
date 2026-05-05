import { LinearGradient } from 'expo-linear-gradient';
import { useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/shared/theme/useTheme';
import { tokens } from '@/shared/theme/tokens';
import type { AccentKey } from '@/shared/theme/tokens';

/**
 * Page-accent backdrop for tab routes. Two static blob gradients per tab
 * accent, in opposite corners, tinted at theme-aware opacity (5% light /
 * 25% dark). Per ADR-02, no rotation, no animation.
 *
 * Implementation note: we pre-render all four tab accents and switch which
 * stack is visible by flipping `opacity`. Earlier we updated the `colors`
 * prop on a single LinearGradient when the route changed, which forced
 * expo-linear-gradient to recreate its native gradient texture and caused a
 * one-frame flash on Android tab transitions. Pre-rendered layers + opacity
 * toggle is GPU-accelerated and instant.
 */

const TAB_ACCENTS: readonly AccentKey[] = ['dashboard', 'transactions', 'budgets', 'insights'];

export function PageBackdrop() {
  const { resolvedScheme } = useTheme();
  const activeKey = useActiveAccentKey();
  const opacityTopLeft = resolvedScheme === 'dark' ? 0.25 : 0.06;
  const opacityBottomRight = resolvedScheme === 'dark' ? 0.18 : 0.04;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {TAB_ACCENTS.map((key) => {
        const accent = tokens.accent[key];
        const visible = activeKey === key;
        return (
          <View
            key={key}
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { opacity: visible ? 1 : 0 }]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={[accent, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 0.7 }}
              style={[StyleSheet.absoluteFill, { opacity: opacityTopLeft }]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={['transparent', accent]}
              start={{ x: 0.3, y: 0.3 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { opacity: opacityBottomRight }]}
            />
          </View>
        );
      })}
    </View>
  );
}

function useActiveAccentKey(): AccentKey {
  const segments = useSegments();
  const map: Record<string, AccentKey> = {
    index: 'dashboard',
    transactions: 'transactions',
    budgets: 'budgets',
    insights: 'insights',
  };
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && map[seg]) return map[seg];
  }
  return 'dashboard';
}
