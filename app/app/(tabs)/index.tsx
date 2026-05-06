import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { formatIDR } from '@/shared/utils/formatIDR';
import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// TODO(T8): real Dashboard (net worth, this-month spending, top-3 categories, recent strip).
export default function DashboardScreen() {
  const { t } = useTranslation(['dashboard']);
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Card padding="lg" className="w-full max-w-md">
        <Text className="font-sans-bold text-2xl mb-1">{t('dashboard:title')}</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          {t('dashboard:comingSoon')}
        </Text>
        <Text
          className="font-mono tabular-nums text-3xl lg:text-5xl mt-6"
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {formatIDR(12_400_000_00)}
        </Text>
        <Text className="font-sans-medium text-xs text-surface-light-fg-muted dark:text-surface-dark-fg-muted mt-1">
          {t('dashboard:netWorthLabel')}
        </Text>
      </Card>
    </View>
  );
}
