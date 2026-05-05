import { Platform, useWindowDimensions } from 'react-native';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/**
 * Determines current viewport breakpoint. Web/desktop is anything ≥1024px on
 * web. Native always returns mobile (we never run native on a tablet without
 * also having a phone-form screen size mattering — tablet-specific layout
 * deferred per ADR-02 §6).
 */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web') return 'mobile';
  if (width >= 1024) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'mobile';
}

export function useIsDesktop(): boolean {
  return useBreakpoint() === 'desktop';
}
