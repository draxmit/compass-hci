import { View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { Text } from '@/shared/ui/Text';

// TODO(T7): FlashList of transactions with chip filters.
export default function TransactionsScreen() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <GlassCard intensity="strong" padding="lg">
        <Text className="font-serif text-2xl mb-1">Transactions</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          Coming in T7.
        </Text>
      </GlassCard>
    </View>
  );
}
