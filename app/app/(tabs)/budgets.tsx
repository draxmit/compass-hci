import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// TODO(T9): monthly limit budgets + progress bars from category_month_totals.
export default function BudgetsScreen() {
  const { t } = useTranslation(['budgets']);
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Card padding="lg" className="w-full max-w-md">
        <Text className="font-sans-bold text-2xl mb-1">{t('budgets:title')}</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          {t('budgets:comingSoon')}
        </Text>
      </Card>
    </View>
  );
}
