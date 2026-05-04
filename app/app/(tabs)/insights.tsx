import { View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { Text } from '@/shared/ui/Text';

// TODO(T8/v2): trend insights, anomaly detection, calendar heatmap.
export default function InsightsScreen() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <GlassCard intensity="strong" padding="lg">
        <Text className="font-serif text-2xl mb-1">Insights</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          Coming in T8 / v2.
        </Text>
      </GlassCard>
    </View>
  );
}
