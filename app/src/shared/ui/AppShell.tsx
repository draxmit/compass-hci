import { View } from 'react-native';
import type { ReactNode } from 'react';

import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { useIsAuthed } from '@/stores/authStore';

import { Sidebar } from './Sidebar';

/**
 * Adaptive root chrome. On desktop (≥1024px web) AND when authed, renders
 * a left sidebar + content area. On mobile/tablet/native, OR when unauthed
 * (auth screens), just renders children unchanged.
 *
 * The auth gate is at the layout level (see `<AuthGate>` in `_layout.tsx`),
 * but AppShell still needs `useIsAuthed()` so the sidebar disappears during
 * the auth flow on desktop.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const isAuthed = useIsAuthed();

  if (isDesktop && isAuthed) {
    return (
      <View className="flex-row flex-1">
        <Sidebar />
        <View className="flex-1">{children}</View>
      </View>
    );
  }
  return <>{children}</>;
}
