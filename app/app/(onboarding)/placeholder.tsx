import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// TODO(T10): real 4-step goal-first onboarding wizard.
export default function OnboardingPlaceholder() {
  const { t } = useTranslation(['common']);
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Card padding="lg" className="w-full max-w-md">
        <Text className="font-sans-bold text-2xl mb-2">{t('common:placeholders.onboardingTitle')}</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          {t('common:placeholders.onboardingComingSoon')}
        </Text>
      </Card>
    </View>
  );
}
