import { Pressable, View } from 'react-native';
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
 * variants only — primary (filled with active page accent) and secondary
 * (transparent + hairline border). Disabled visual when `isPending`. 44pt
 * touch target. Loading text is the same as children for now (spinner left
 * out by ADR-02 motion budget); future iterations can swap.
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
  // Primary text contrast: filled accent → white-on-accent regardless of
  // theme (page accents are mid-saturation, all readable on white text).
  const primaryTextColor = '#ffffff';
  const secondaryTextColor = isDark
    ? tokens.surface['dark-fg']
    : tokens.surface['light-fg'];

  const containerStyle = isPrimary
    ? { backgroundColor: accent, opacity: isPending ? 0.6 : 1 }
    : {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'],
        opacity: isPending ? 0.6 : 1,
      };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isPending }}
      disabled={isPending}
      onPress={onPress}
      className="rounded-xl"
      style={({ pressed }) => [
        containerStyle,
        {
          paddingVertical: 12,
          paddingHorizontal: 20,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity:
            (containerStyle.opacity ?? 1) *
            (pressed ? 0.85 : 1),
        },
      ]}
    >
      <View>
        <Text
          className="font-sans-semibold text-base"
          style={{ color: isPrimary ? primaryTextColor : secondaryTextColor }}
        >
          {children}
        </Text>
      </View>
    </Pressable>
  );
}
