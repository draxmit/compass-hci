import { View } from 'react-native';

import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// TODO(T10): real 4-step goal-first onboarding wizard.
export default function OnboardingPlaceholder() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Card padding="lg" className="w-full max-w-md">
        <Text className="font-sans-bold text-2xl mb-2">Onboarding</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          Coming in T10 (goal-first wizard).
        </Text>
      </Card>
    </View>
  );
}
