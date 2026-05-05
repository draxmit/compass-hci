import { Text as RNText } from 'react-native';
import type { TextProps as RNTextProps } from 'react-native';

export type TextProps = RNTextProps & {
  className?: string;
};

/**
 * Themed Text primitive. Defaults to Inter body + theme-aware foreground color.
 * For display numbers (Geist Mono Bold + tabular-nums) use `font-mono tabular-nums`.
 * For headings use `font-sans-bold text-{size}`.
 */
export function Text({ className, ...rest }: TextProps) {
  const base = 'font-sans text-surface-light-fg dark:text-surface-dark-fg';
  return <RNText className={className ? `${base} ${className}` : base} {...rest} />;
}
