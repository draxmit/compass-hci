import { LinearGradient } from 'expo-linear-gradient';
import { useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from '@/shared/theme/useTheme';
import { tokens } from '@/shared/theme/tokens';
import type { AccentKey } from '@/shared/theme/tokens';

/**
 * Page-accent backdrop for tab routes. Two static blob gradients per tab
 * accent in opposite corners, tinted at theme-aware opacity (5% light /
 * 25% dark).
 *
 * Implementation:
 *   - All four tab accents are pre-rendered as separate gradient layers at
 *     mount time. expo-linear-gradient on Android recreates its native
 *     gradient texture if the `colors` prop changes, which previously caused
 *     a one-frame flash on tab transitions. Pre-rendered layers + an
 *     opacity toggle avoids any texture work.
 *   - Each layer's visibility is driven by Animated.Value with a 250 ms
 *     timing transition (useNativeDriver: true) so the crossfade runs on
 *     the GPU off the JS thread. Subtle enough to read as "calm", long
 *     enough to bridge any ~16ms layout stutter on first tab visits.
 *
 * Per ADR-02 motion budget: a soft 250 ms opacity crossfade is permitted
 * (no rotation, no parallax, no scale).
 */

const TAB_ACCENTS: readonly AccentKey[] = ['dashboard', 'transactions', 'budgets', 'insights'];
const FADE_DURATION_MS = 250;

export function PageBackdrop() {
  const { resolvedScheme } = useTheme();
  const activeKey = useActiveAccentKey();
  const opacityTopLeft = resolvedScheme === 'dark' ? 0.25 : 0.06;
  const opacityBottomRight = resolvedScheme === 'dark' ? 0.18 : 0.04;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {TAB_ACCENTS.map((key) => (
        <AccentLayer
          key={key}
          accentColor={tokens.accent[key]}
          visible={activeKey === key}
          opacityTopLeft={opacityTopLeft}
          opacityBottomRight={opacityBottomRight}
        />
      ))}
    </View>
  );
}

type AccentLayerProps = {
  accentColor: string;
  visible: boolean;
  opacityTopLeft: number;
  opacityBottomRight: number;
};

function AccentLayer({ accentColor, visible, opacityTopLeft, opacityBottomRight }: AccentLayerProps) {
  const layerOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(layerOpacity, {
      toValue: visible ? 1 : 0,
      duration: FADE_DURATION_MS,
      useNativeDriver: true,
    }).start();
  }, [visible, layerOpacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: layerOpacity }]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[accentColor, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.7, y: 0.7 }}
        style={[StyleSheet.absoluteFill, { opacity: opacityTopLeft }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', accentColor]}
        start={{ x: 0.3, y: 0.3 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: opacityBottomRight }]}
      />
    </Animated.View>
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
