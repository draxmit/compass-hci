import { View } from 'react-native';

import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// TODO(T8): real Dashboard (net worth, this-month spending, top-3 categories, recent strip).
export default function DashboardScreen() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Card padding="lg" className="w-full max-w-md">
        <Text className="font-sans-bold text-2xl mb-1">Dashboard</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          Coming in T8.
        </Text>
        <Text className="font-mono tabular-nums text-5xl mt-6">
          Rp 12.400.000
        </Text>
        <Text className="font-sans-medium text-xs text-surface-light-fg-muted dark:text-surface-dark-fg-muted mt-1">
          NET WORTH · placeholder
        </Text>
      </Card>
    </View>
  );
}
