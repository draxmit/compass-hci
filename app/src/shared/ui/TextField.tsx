import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';

import { Text } from './Text';

export type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  keyboardType?: TextInputProps['keyboardType'];
  errorText?: string;
  accessibilityLabel?: string;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
};

/**
 * Form input primitive (ADR-03 §7). Filled subtle surface, hairline border,
 * focus ring uses the active page accent. 44pt minimum touch target via
 * py-3 px-4 + min-height. Placeholder text uses fg-muted token.
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize,
  keyboardType,
  errorText,
  accessibilityLabel,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const { color: accent } = usePageAccent();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const placeholderColor = isDark
    ? tokens.surface['dark-fg-faint']
    : tokens.surface['light-fg-faint'];
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];

  const borderColor = errorText
    ? tokens.semantic.danger
    : focused
    ? accent
    : isDark
    ? tokens.surface['dark-border']
    : tokens.surface['light-border'];

  return (
    <View className="w-full">
      <Text className="font-sans-medium text-xs mb-1.5 text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
        {label}
      </Text>
      <View
        className="rounded-xl bg-surface-light-input dark:bg-surface-dark-input"
        style={{
          borderWidth: 1,
          borderColor,
          // Faint focus ring outside the border using box-shadow on web; a
          // subtle inner glow on native via shadow* props is too noisy, so we
          // rely on the border color swap alone there.
          ...(focused && !errorText
            ? ({
                boxShadow: `0 0 0 3px ${accent}33`,
              } as Record<string, unknown>)
            : null),
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          accessibilityLabel={accessibilityLabel ?? label}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            color: fgColor,
            fontFamily: 'Inter_400Regular',
            fontSize: 16,
            paddingHorizontal: 16,
            paddingVertical: 12,
            minHeight: 44,
            // RN <TextInput> on web exposes outline; we suppress it since the
            // ring above provides the focus affordance.
            outlineWidth: 0,
          }}
        />
      </View>
      {errorText ? (
        <Text className="font-sans text-xs mt-1.5" style={{ color: tokens.semantic.danger }}>
          {errorText}
        </Text>
      ) : null}
    </View>
  );
}
