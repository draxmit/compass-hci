import { Link, Stack } from 'expo-router';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

export default function NotFoundScreen() {
  const { t } = useTranslation(['common']);
  return (
    <>
      <Stack.Screen options={{ title: t('common:placeholders.notFoundTitle') }} />
      <View className="flex-1 items-center justify-center px-6">
        <Card padding="lg" className="items-center">
          <Text className="font-sans-bold text-3xl mb-2">{t('common:placeholders.notFoundTitle')}</Text>
          <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-4">
            {t('common:placeholders.notFoundBody')}
          </Text>
          <Link href="/" className="font-sans-medium underline">
            <Text className="font-sans-medium underline">{t('common:placeholders.notFoundLink')}</Text>
          </Link>
        </Card>
      </View>
    </>
  );
}
