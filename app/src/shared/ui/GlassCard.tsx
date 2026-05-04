import { BlurView } from 'expo-blur';
import { View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/shared/theme/useTheme';
import { useUiStore } from '@/stores/uiStore';

export type GlassCardProps = {
  intensity?: 'subtle' | 'strong';
  tint?: 'auto' | 'light' | 'dark';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
};

const paddingClass: Record<NonNullable<GlassCardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-7',
};

function fallbackBgClass(intensity: 'subtle' | 'strong', isDark: boolean): string {
  if (isDark) return intensity === 'strong' ? 'bg-glass-strong-dark' : 'bg-glass-subtle-dark';
  return intensity === 'strong' ? 'bg-glass-strong-light' : 'bg-glass-subtle-light';
}

/**
 * Native GlassCard. Wraps BlurView from expo-blur unless the device is low-end,
 * in which case it falls back to a translucent solid View at the same shape.
 */
export function GlassCard({
  intensity = 'subtle',
  tint = 'auto',
  padding = 'md',
  children,
  style,
  className,
}: GlassCardProps) {
  const { resolvedScheme } = useTheme();
  const lowEndMode = useUiStore((s) => s.lowEndMode);
  const isDark = resolvedScheme === 'dark';

  const resolvedTint: 'light' | 'dark' = tint === 'auto' ? (isDark ? 'dark' : 'light') : tint;
  const blurIntensity = intensity === 'strong' ? 60 : 30;
  const radius = 'rounded-2xl';
  const border = isDark ? 'border border-surface-dark-border' : 'border border-surface-light-border';
  const pad = paddingClass[padding];
  const composedClass = [radius, border, pad, className].filter(Boolean).join(' ');

  if (lowEndMode) {
    const bg = fallbackBgClass(intensity, isDark);
    return (
      <View className={`${composedClass} ${bg}`} style={style}>
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={blurIntensity}
      tint={resolvedTint}
      className={composedClass}
      style={[{ overflow: 'hidden' }, style]}
    >
      {children}
    </BlurView>
  );
}
