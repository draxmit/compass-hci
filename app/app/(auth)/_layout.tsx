import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Auth route group layout. Wraps the Stack in a safe-area view so notches +
 * status bars don't clip the centered Card. The `<AuthGate>` in the root
 * layout owns the redirect logic (signed-in users in (auth) get sent to
 * (tabs)); this layout just provides chrome.
 */
export default function AuthLayout() {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: 'transparent' }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </SafeAreaView>
  );
}
