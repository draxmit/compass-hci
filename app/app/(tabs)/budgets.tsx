import { View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { Text } from '@/shared/ui/Text';

// TODO(T9): monthly limit budgets + progress bars from category_month_totals.
export default function BudgetsScreen() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <GlassCard intensity="strong" padding="lg">
        <Text className="font-serif text-2xl mb-1">Budgets</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          Coming in T9.
        </Text>
      </GlassCard>
    </View>
  );
}
