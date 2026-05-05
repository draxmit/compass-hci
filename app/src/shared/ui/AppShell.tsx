import { View } from 'react-native';
import type { ReactNode } from 'react';

import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { Sidebar } from './Sidebar';

/**
 * Adaptive root chrome. On desktop (≥1024px web), renders a left sidebar +
 * content area. On mobile/tablet/native, just renders children unchanged
 * (the (tabs) route group provides the bottom tab bar + FAB on mobile).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <View className="flex-row flex-1">
        <Sidebar />
        <View className="flex-1">{children}</View>
      </View>
    );
  }
  return <>{children}</>;
}
