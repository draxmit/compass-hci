import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';

/**
 * Auth route group layout. Wraps the Stack in a safe-area view so notches +
 * status bars don't clip content. The `<AuthGate>` in the root layout owns
 * the redirect logic (signed-in users in (auth) get sent to (tabs)); this
 * layout just provides chrome.
 *
 * Stack screen options use `animation: 'none'` + an opaque
 * `contentStyle.backgroundColor` so navigating sign-in ↔ sign-up doesn't
 * briefly composite the previous screen on Android. Combined with the
 * `replace` mode on the cross-link in those screens, the transition reads
 * as an instant swap rather than an overlay flash.
 */
export default function AuthLayout() {
  const { resolvedScheme } = useTheme();
  const overlayBg =
    resolvedScheme === 'dark' ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: 'transparent' }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          animationDuration: 0,
          contentStyle: { backgroundColor: overlayBg },
        }}
      />
    </SafeAreaView>
  );
}
