import { View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { Text } from '@/shared/ui/Text';

// TODO(T10): real 4-step goal-first onboarding wizard.
export default function OnboardingPlaceholder() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <GlassCard intensity="strong" padding="lg">
        <Text className="font-serif text-2xl mb-2">Onboarding</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          Coming in T10 (goal-first wizard).
        </Text>
      </GlassCard>
    </View>
  );
}
