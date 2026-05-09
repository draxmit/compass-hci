import React, { useEffect } from 'react';
import { Animated, View, type StyleProp, type ViewStyle, type DimensionValue } from 'react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Loading-state placeholder primitive — animated muted block that
 * reads as "content here is materialising" instead of empty space.
 *
 * Visual treatment:
 *   - rounded muted bar pulsing between 0.4 and 0.8 opacity (~1.2s
 *     cycle) — slow enough to feel calm, fast enough to read as live
 *   - colour follows the theme's border token so it harmonises with
 *     real surfaces underneath
 *
 * Implementation note: uses `Animated` (not Reanimated) on purpose —
 * the value loops at the JS thread but only drives a single opacity
 * style, which RN composites efficiently. Avoids pulling Reanimated
 * worklets into pages that don't otherwise need them.
 */
export function Skeleton({ width = '100%', height = 14, radius = 6, style }: SkeletonProps) {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const opacity = React.useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: isDark
            ? tokens.surface['dark-border']
            : tokens.surface['light-border'],
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * Card-shaped skeleton block — emulates a Card primitive boundary
 * (rounded 2xl, hairline border) with internal Skeleton bars. Use in
 * place of a real Card during cold load.
 */
export function SkeletonCard({
  height = 96,
  children,
  style,
}: {
  height?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  return (
    <View
      style={[
        {
          minHeight: height,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isDark
            ? tokens.surface['dark-border']
            : tokens.surface['light-border'],
          backgroundColor: isDark
            ? tokens.surface['dark-card']
            : tokens.surface['light-card'],
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
