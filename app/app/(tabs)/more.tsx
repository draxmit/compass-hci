import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lightbulb, ChevronRight } from 'lucide-react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import type { ThemeMode } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';
import { useIsDesktop } from '@/shared/hooks/useBreakpoint';

// T1 acceptance smoke test: cycle theme via three buttons.
// TODO(T11): full settings (language toggle, biometric, sign-out, account deletion).
export default function MoreScreen() {
  const { mode, setMode } = useTheme();
  const router = useRouter();
  const isDesktop = useIsDesktop();

  const buttons: { label: string; value: ThemeMode }[] = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'System', value: 'system' },
  ];

  return (
    <View className="flex-1 px-6 pt-12">
      <Text className="font-sans-bold text-3xl mb-1">More</Text>
      <Text className="font-sans text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-8">
        Settings — full version in T11.
      </Text>

      <Card padding="lg" className="mb-4 w-full max-w-md">
        <Text className="font-sans-semibold text-base mb-4">Theme</Text>
        <View className="flex-row gap-2">
          {buttons.map((b) => {
            const active = mode === b.value;
            const baseClass =
              'flex-1 items-center justify-center rounded-xl py-3 border min-h-[44px]';
            return (
              <Pressable
                key={b.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Set theme to ${b.label}`}
                onPress={() => setMode(b.value)}
                className={baseClass}
                style={
                  active
                    ? { backgroundColor: tokens.accent.dashboard, borderColor: tokens.accent.dashboard }
                    : undefined
                }
              >
                <Text
                  className={
                    active
                      ? 'font-sans-medium text-white'
                      : 'font-sans-medium text-surface-light-fg dark:text-surface-dark-fg'
                  }
                >
                  {b.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Insights link — moved out of bottom tabs in ADR-02 */}
      {!isDesktop && (
        <Card padding="none" className="w-full max-w-md">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open Insights"
            onPress={() => router.push('/insights')}
            className="flex-row items-center px-5 py-4 min-h-[44px]"
          >
            <Lightbulb size={20} color={tokens.accent.insights} />
            <Text className="font-sans-medium ml-3 flex-1">Insights</Text>
            <ChevronRight size={18} color={tokens.surface['dark-fg-muted']} />
          </Pressable>
        </Card>
      )}
    </View>
  );
}
