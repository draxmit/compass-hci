import { useSegments } from 'expo-router';
import { View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { useTheme } from '@/shared/theme/useTheme';
import { tokens } from '@/shared/theme/tokens';
import type { AccentKey } from '@/shared/theme/tokens';

/**
 * Web PageBackdrop. Fixed-position div with two radial gradients in opposite
 * corners using CSS. Static (no rotation, no animation) per ADR-02.
 *
 * Crossfades between page accents on route change via 200ms transition.
 * Honors `prefers-reduced-motion` (no transition).
 */
export function PageBackdrop() {
  const { resolvedScheme } = useTheme();
  const accent = useActiveAccent();
  const isDark = resolvedScheme === 'dark';
  const intensityA = isDark ? 0.25 : 0.06;
  const intensityB = isDark ? 0.18 : 0.04;

  // Two radial gradients in opposite corners, layered on a transparent base.
  const wrapperStyle = {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    zIndex: -1,
    backgroundImage: [
      `radial-gradient(ellipse 60% 50% at 0% 0%, ${hexToRgba(accent, intensityA)} 0%, transparent 60%)`,
      `radial-gradient(ellipse 60% 50% at 100% 100%, ${hexToRgba(accent, intensityB)} 0%, transparent 60%)`,
    ].join(','),
    transition: 'background-image 250ms ease-out',
  } as unknown as ViewStyle;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (prefers-reduced-motion: reduce) {
              .compass-page-backdrop { transition: none !important; }
            }
          `,
        }}
      />
      <View className="compass-page-backdrop" style={wrapperStyle} />
    </>
  );
}

function useActiveAccent(): string {
  const segments = useSegments();
  const map: Record<string, AccentKey> = {
    'index': 'dashboard',
    'transactions': 'transactions',
    'budgets': 'budgets',
    'insights': 'insights',
    'more': 'neutral',
  };
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && map[seg]) return tokens.accent[map[seg]];
  }
  return tokens.accent.dashboard;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
