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
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const placeholderColor = isDark
    ? tokens.surface['dark-fg-faint']
    : tokens.surface['light-fg-faint'];
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  // No focus state — the cursor + keyboard appearance is signal enough that
  // the user is editing. Earlier iterations swapped border to a page accent
  // and added a halo; both read as visual noise on a touch-first mobile UI.
  // Border stays the resting hairline regardless of focus.
  const borderColor = errorText
    ? tokens.semantic.danger
    : isDark
      ? tokens.surface['dark-border']
      : tokens.surface['light-border'];

  return (
    <View className="w-full">
      {/* Skip rendering the label entirely when callers pass label="".
          Otherwise the empty <Text> still occupies a line of height +
          margin and breaks compact inline layouts (e.g. the
          inline-amount cells on the first-budget onboarding step). */}
      {label.length > 0 ? (
        <Text className="font-sans-medium text-xs mb-1.5 text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          {label}
        </Text>
      ) : null}
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
          // Suppress Android's native TextInput underline — it ships a
          // material-style underline by default that we don't want.
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
