import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

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
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const placeholderColor = isDark
    ? tokens.surface['dark-fg-faint']
    : tokens.surface['light-fg-faint'];
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const restingBorder = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  // Focus state uses the muted-fg colour rather than the page accent. The
  // accent (violet on most routes) read as a heavy dark outline on small
  // mobile screens; a slightly-darker neutral border is the Mercury × Raycast
  // affordance — visible enough to know the field is focused, quiet enough
  // not to draw attention away from the typed value.
  const focusBorder = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];

  const borderColor = errorText
    ? tokens.semantic.danger
    : focused
      ? focusBorder
      : restingBorder;

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
          // Focus state: just the accent border swap. We previously added a
          // 3px box-shadow halo, but on small mobile screens the
          // border + halo combo on a high-contrast input read as a heavy
          // black box (issue surfaced in T4 categories edit panel). Border
          // colour change alone is enough affordance.
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
          // Suppress Android's native TextInput underline — it ships a
          // material-style underline by default that fights our wrapper
          // border on focus, reading as a heavy second outline.
          underlineColorAndroid="transparent"
          style={{
            color: fgColor,
            fontFamily: 'Inter_400Regular',
            fontSize: 16,
            paddingHorizontal: 16,
            paddingVertical: 12,
            minHeight: 44,
            // RN <TextInput> on web exposes a default outline on focus; we
            // suppress it since the wrapper border-colour swap is enough.
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
