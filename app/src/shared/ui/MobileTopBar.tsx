import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthUser } from '@/stores/authStore';
import { Avatar } from './Avatar';

/**
 * Mobile-only top bar shown above tab content. Right-aligned avatar that
 * opens /profile on tap. Profile screen has Settings link inside.
 *
 * Lives in (tabs)/_layout.tsx via Tabs.screenOptions.header so it's
 * persistent across all tab screens.
 */
export function MobileTopBar() {
  const router = useRouter();
  const user = useAuthUser();

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
      <View className="flex-row justify-end px-4 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          onPress={() => router.push('/profile')}
          hitSlop={8}
          className="rounded-full"
        >
          <Avatar
            photoURL={user?.photoURL ?? null}
            displayName={user?.displayName ?? null}
            email={user?.email ?? null}
            size={36}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
