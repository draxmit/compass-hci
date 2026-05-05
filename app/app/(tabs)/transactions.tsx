import { View } from 'react-native';

import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// TODO(T7): FlashList of transactions with chip filters.
export default function TransactionsScreen() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Card padding="lg" className="w-full max-w-md">
        <Text className="font-sans-bold text-2xl mb-1">Transactions</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          Coming in T7.
        </Text>
      </Card>
    </View>
  );
}
