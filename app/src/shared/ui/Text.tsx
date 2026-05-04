import { Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';

export type TextProps = RNTextProps & {
  className?: string;
};

/**
 * Themed Text primitive. Defaults to Barlow body + theme-aware foreground color.
 * Override via `className` (e.g. `font-serif text-2xl`).
 */
export function Text({ className, ...rest }: TextProps) {
  const base = 'font-sans text-surface-light-fg dark:text-surface-dark-fg';
  return <RNText className={className ? `${base} ${className}` : base} {...rest} />;
}
