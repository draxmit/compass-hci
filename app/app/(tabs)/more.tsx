import { Pressable, View } from 'react-native';

import { useTheme } from '@/shared/theme/useTheme';
import type { ThemeMode } from '@/shared/theme/useTheme';
import { GlassCard } from '@/shared/ui/GlassCard';
import { Text } from '@/shared/ui/Text';

// T1 acceptance smoke test: cycle theme via three buttons.
// TODO(T11): full settings (language toggle, biometric, sign-out, account deletion).
export default function MoreScreen() {
  const { mode, setMode } = useTheme();

  const buttons: { label: string; value: ThemeMode }[] = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'System', value: 'system' },
  ];

  return (
    <View className="flex-1 items-center justify-center px-6">
      <GlassCard intensity="strong" padding="lg" className="w-full max-w-md">
        <Text className="font-serif text-2xl mb-1">More</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-5">
          Settings — full version in T11.
        </Text>

        <Text className="font-sans-medium mb-2">Theme</Text>
        <View className="flex-row gap-2">
          {buttons.map((b) => {
            const active = mode === b.value;
            const baseClass =
              'flex-1 items-center justify-center rounded-xl py-3 border ' +
              (active
                ? 'bg-aurora-violet border-aurora-violet'
                : 'border-surface-light-border dark:border-surface-dark-border');
            const labelClass = active
              ? 'font-sans-medium text-white'
              : 'font-sans-medium text-surface-light-fg dark:text-surface-dark-fg';
            return (
              <Pressable
                key={b.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setMode(b.value)}
                className={baseClass}
              >
                <Text className={labelClass}>{b.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>
    </View>
  );
}
