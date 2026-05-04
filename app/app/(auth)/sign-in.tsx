import { View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { Text } from '@/shared/ui/Text';

// TODO(T2): real sign-in (Google + email/password) wiring.
export default function SignInScreen() {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <GlassCard intensity="strong" padding="lg">
        <Text className="font-serif text-2xl mb-2">Sign In</Text>
        <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
          Coming in T2 (Firebase auth).
        </Text>
      </GlassCard>
    </View>
  );
}
