import { useSegments } from 'expo-router';

import { tokens } from '@/shared/theme/tokens';
import type { AccentKey } from '@/shared/theme/tokens';

/**
 * Maps the active route segment to a page accent color.
 * Used by Sidebar (active item highlight), PageBackdrop (gradient color),
 * and individual screens that want their accent (e.g. chart color).
 */
export function usePageAccent(): { key: AccentKey; color: string } {
  const segments = useSegments();
  const map: Record<string, AccentKey> = {
    'index': 'dashboard',
    'transactions': 'transactions',
    'budgets': 'budgets',
    'insights': 'insights',
    'more': 'neutral',
  };
  // Find the most specific known segment, walking from last → first.
  // Root path is `["(tabs)"]` (no leaf segment) → treat as Dashboard.
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && map[seg]) {
      const key = map[seg];
      return { key, color: tokens.accent[key] };
    }
  }
  // Fallback when only group segments exist (e.g. `["(tabs)"]`).
  return { key: 'dashboard', color: tokens.accent.dashboard };
}
