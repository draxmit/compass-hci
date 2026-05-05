import { View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type CardProps = {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

const paddingClass: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm:   'p-4',
  md:   'p-6',
  lg:   'p-8',
};

/**
 * Flat card primitive — hairline border, subtle surface tint, no shadow, no
 * blur. Same implementation across web + native (no platform fork).
 *
 * Theme: ADR-02 "Dark Mercury × Raycast". Card surface lifts ~3-4% above the
 * page bg in either light or dark, with a 1px hairline border at 10% alpha.
 */
export function Card({ padding = 'md', className, style, children }: CardProps) {
  const composed = [
    'rounded-2xl',
    'border',
    'border-surface-light-border dark:border-surface-dark-border',
    'bg-surface-light-card dark:bg-surface-dark-card',
    paddingClass[padding],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <View className={composed} style={style}>
      {children}
    </View>
  );
}
