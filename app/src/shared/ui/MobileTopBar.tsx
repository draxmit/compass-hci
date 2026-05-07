import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs';
import { useRouter, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthUser } from '@/stores/authStore';
import { Avatar } from './Avatar';
import { Text } from './Text';

/**
 * Mobile-only top bar shown above tab content. Renders the active tab's
 * title on the left and the avatar (tap → /profile) on the right.
 *
 * Lives in (tabs)/_layout.tsx via Tabs.screenOptions.header so it's
 * persistent across all tab screens. Receives `BottomTabHeaderProps` so it
 * can read each screen's `title` from its `Tabs.Screen` options.
 *
 * Avatar tap uses `replace` rather than `push`: replacing the (tabs) entry
 * removes the layered Stack composition that was causing a one-frame
 * snapshot-reveal flash on Android even with fullScreenModal + animation:
 * 'none' + opaque contentStyle. Back from /profile lands on Dashboard via
 * profile.tsx's canGoBack-fallback (no stack remembers which tab we left).
 */
export function MobileTopBar({ options }: BottomTabHeaderProps) {
  const { t } = useTranslation(['common']);
  const router = useRouter();
  const segments = useSegments();
  const user = useAuthUser();

  const title = typeof options.title === 'string' ? options.title : '';

  // Pass the current tab as `?from=...` so the profile screen's back
  // button can route back to the right tab. The (tabs) group emits
  // segments like ['(tabs)', 'transactions'] (or just ['(tabs)'] for
  // the index tab) — translate to a route path.
  const fromPath = (() => {
    const tabSeg = segments[1];
    if (!tabSeg) return '/';  // dashboard / index
    if (['transactions', 'budgets', 'insights'].includes(tabSeg)) return `/${tabSeg}`;
    return '/';
  })();

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
      <View className="flex-row items-center justify-between px-6 py-3">
        <Text className="font-sans-bold text-2xl flex-1" numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common:nav.openProfile')}
          onPress={() => router.replace(`/profile?from=${encodeURIComponent(fromPath)}`)}
          hitSlop={8}
          className="rounded-full ml-3"
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
