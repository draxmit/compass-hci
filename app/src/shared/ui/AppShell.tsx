import { useSegments } from 'expo-router';
import { View } from 'react-native';
import type { ReactNode } from 'react';

import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { useIsAuthed } from '@/stores/authStore';

import { Sidebar } from './Sidebar';

/**
 * Adaptive root chrome. On desktop (≥1024px web) AND when authed AND
 * the user is not inside a focused-flow group (auth or onboarding),
 * renders a left sidebar + content area. On mobile/tablet/native, OR
 * when unauthed (auth screens), OR mid-onboarding wizard, just renders
 * children unchanged so the flow reads as a focused single column.
 *
 * The auth gate (`<AuthGate>` in `_layout.tsx`) handles the actual
 * redirect logic and prevents bypass. AppShell only handles the visual
 * chrome — without the focused-flow exclusion, a user mid-onboarding
 * would see the desktop sidebar with all the tabs, which is confusing
 * (they can't navigate to them; AuthGate would just bounce them back).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const isAuthed = useIsAuthed();
  const segments = useSegments();
  const inFocusedFlow = segments[0] === '(onboarding)' || segments[0] === '(auth)';

  if (isDesktop && isAuthed && !inFocusedFlow) {
    return (
      <View className="flex-row flex-1">
        <Sidebar />
        <View className="flex-1">{children}</View>
      </View>
    );
  }
  return <>{children}</>;
}
