import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { GlassCard } from '@/shared/ui/GlassCard';
import { Text } from '@/shared/ui/Text';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View className="flex-1 items-center justify-center px-6">
        <GlassCard intensity="strong" padding="lg" className="items-center">
          <Text className="font-serif text-3xl mb-2">Lost?</Text>
          <Text className="text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-4">
            That route doesn{"’"}t exist.
          </Text>
          <Link href="/" className="font-sans-medium underline">
            <Text className="font-sans-medium underline">Go home</Text>
          </Link>
        </GlassCard>
      </View>
    </>
  );
}
