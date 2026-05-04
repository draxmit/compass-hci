import { View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/shared/theme/useTheme';

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

/**
 * Web GlassCard. Pure View with backdrop-filter inline style.
 * Note: backdrop-filter has partial Firefox support — we layer an opaque-enough
 * rgba background so the card stays readable even without blur.
 */
export function GlassCard({
  intensity = 'subtle',
  tint: _tint = 'auto',
  padding = 'md',
  children,
  style,
  className,
}: GlassCardProps) {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const blurPx = intensity === 'strong' ? 24 : 12;

  const bgClass = isDark
    ? intensity === 'strong'
      ? 'bg-glass-strong-dark'
      : 'bg-glass-subtle-dark'
    : intensity === 'strong'
      ? 'bg-glass-strong-light'
      : 'bg-glass-subtle-light';
  const border = isDark ? 'border border-surface-dark-border' : 'border border-surface-light-border';
  const pad = paddingClass[padding];

  const composedClass = ['rounded-2xl', border, bgClass, pad, className].filter(Boolean).join(' ');

  // backdropFilter is not in the official ViewStyle type; cast through unknown.
  const inlineStyle = {
    backdropFilter: `blur(${blurPx}px)`,
    WebkitBackdropFilter: `blur(${blurPx}px)`,
  } as unknown as ViewStyle;

  return (
    <View className={composedClass} style={[inlineStyle, style]}>
      {children}
    </View>
  );
}
