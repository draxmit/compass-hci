import { View } from 'react-native';

import { usePageAccent } from '@/shared/hooks/usePageAccent';

import { Logo } from './Logo';
import { PageBackdrop } from './PageBackdrop';

/**
 * Full-screen splash. Centered Logo over PageBackdrop. No spinner, no
 * minimum display floor (ADR-03 orchestrator decision #3) — Firebase auth
 * resolves quickly enough that any minimum would feel padded.
 *
 * Used by `<AuthGate>` while `useAuthStore.isLoading` is true.
 */
export function Splash() {
  const { color: accent } = usePageAccent();
  return (
    <View className="flex-1 items-center justify-center">
      <PageBackdrop />
      <Logo size={64} color={accent} />
    </View>
  );
}
