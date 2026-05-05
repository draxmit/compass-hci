import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// Insights moved out of bottom tabs in ADR-02 (5 → 4 tabs + FAB on mobile).
// Reachable via Sidebar on desktop and via More menu on mobile.
// TODO(T8/v2): trend insights, anomaly detection, calendar heatmap.
export default function InsightsScreen() {
  const { t } = useTranslation(['common']);
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Card padding="lg" className="w-full max-w-md">
        <Text className="font-sans-bold text-2xl mb-1">{t('common:nav.insights')}</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          {t('common:placeholders.comingSoonInsights')}
        </Text>
      </Card>
    </View>
  );
}
