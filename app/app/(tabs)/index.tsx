import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';

import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// TODO(T8): real Dashboard (net worth, this-month spending, top-3 categories, recent strip).
export default function DashboardScreen() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { resolvedScheme } = useTheme();
  const mutedColor =
    resolvedScheme === 'dark'
      ? tokens.surface['dark-fg-muted']
      : tokens.surface['light-fg-muted'];

  return (
    <View className="flex-1 px-6 pt-12">
      {/* Mobile-only gear icon for accessing /more (settings + sign-out).
          Desktop has Sidebar's More item, so doesn't need this. */}
      {!isDesktop && (
        <View className="flex-row justify-end mb-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            onPress={() => router.push('/more')}
            hitSlop={8}
            className="w-11 h-11 items-center justify-center rounded-xl"
          >
            <Settings size={22} color={mutedColor} />
          </Pressable>
        </View>
      )}

      <View className="flex-1 items-center justify-center">
        <Card padding="lg" className="w-full max-w-md">
          <Text className="font-sans-bold text-2xl mb-1">Dashboard</Text>
          <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
            Coming in T8.
          </Text>
          <Text
            className="font-mono tabular-nums text-3xl lg:text-5xl mt-6"
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            Rp 12.400.000
          </Text>
          <Text className="font-sans-medium text-xs text-surface-light-fg-muted dark:text-surface-dark-fg-muted mt-1">
            NET WORTH · placeholder
          </Text>
        </Card>
      </View>
    </View>
  );
}
