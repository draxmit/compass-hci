import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// TODO(T7): FlashList of transactions with chip filters.
export default function TransactionsScreen() {
  const { t } = useTranslation(['transactions']);
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Card padding="lg" className="w-full max-w-md">
        <Text className="font-sans-bold text-2xl mb-1">{t('transactions:title')}</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          {t('transactions:comingSoon')}
        </Text>
      </Card>
    </View>
  );
}
