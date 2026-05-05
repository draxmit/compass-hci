import { useState } from 'react';
import { Pressable } from 'react-native';
import type { ReactNode } from 'react';

import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';

import { Text } from './Text';

export type ButtonProps = {
  variant?: 'primary' | 'secondary';
  onPress: () => void;
  isPending?: boolean;
  children: ReactNode;
  accessibilityLabel?: string;
};

/**
 * Minimal button primitive (ADR-03 §6, orchestrator decision #1). Two
 * variants: primary (filled with active page accent) and secondary
 * (transparent + hairline border). 44pt touch target.
 *
 * Implementation note: NativeWind's Pressable className wrapper conflicts
 * with Pressable's function-form `style={({pressed}) => ...}` — the function
 * runs but the returned style is ignored. Workaround is to use a static
 * style array and track `pressed` via local state.
 */
export function Button({
  variant = 'primary',
  onPress,
  isPending = false,
  children,
  accessibilityLabel,
}: ButtonProps) {
  const { color: accent } = usePageAccent();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const isPrimary = variant === 'primary';
  const [pressed, setPressed] = useState(false);

  const baseColor = isPrimary
    ? accent
    : 'transparent';
  const borderColor = isPrimary
    ? accent
    : isDark
      ? tokens.surface['dark-border']
      : tokens.surface['light-border'];
  const textColor = isPrimary
    ? '#ffffff'
    : isDark
      ? tokens.surface['dark-fg']
      : tokens.surface['light-fg'];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isPending }}
      disabled={isPending}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        backgroundColor: baseColor,
        borderColor,
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 20,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isPending ? 0.5 : pressed ? 0.85 : 1,
      }}
    >
      <Text
        className="font-sans-semibold text-base"
        style={{ color: textColor }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
