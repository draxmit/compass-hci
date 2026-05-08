import { useSegments } from 'expo-router';

import { tokens } from '@/shared/theme/tokens';
import type { AccentKey } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';

/**
 * Maps the active route segment to a page accent color, theme-aware.
 *
 * The `neutral` accent (used by More / Settings) intentionally has no
 * brand color — it should read as the theme's foreground (white in dark,
 * near-black in light). The static token `tokens.accent.neutral` is only
 * white because tokens.cjs has no theme context; this hook resolves the
 * theme-correct neutral at runtime.
 *
 * Used by Sidebar (active item highlight + logo + CTA), PageBackdrop
 * (gradient color), and individual screens that want their accent.
 */
export function usePageAccent(): { key: AccentKey; color: string } {
  const segments = useSegments();
  const { resolvedScheme } = useTheme();

  const map: Record<string, AccentKey> = {
    // (tabs) routes
    'index': 'dashboard',
    'transactions': 'transactions',
    'budgets': 'budgets',
    'insights': 'insights',
    // Transaction CRUD lives at /transaction/* — singular segment, but
    // belongs to the Transactions section so the sidebar highlights
    // Transactions while the user is creating/editing one.
    'transaction': 'transactions',
    // Monthly summary report at /report/[yearMonth] is the natural
    // extension of the Budgets tab — Budgets footer is the only path
    // that opens it, and the report is the read-side of the same
    // monthly data the budgets manage. Highlight Budgets while
    // viewing it (was previously falling through to Dashboard).
    'report': 'budgets',
    // Profile-area config screens — none have a dedicated tab, they all
    // hang off Profile. Map to neutral so the sidebar doesn't ghost-
    // highlight any primary tab; the Profile footer entry lights up
    // instead via accentKey === 'neutral'.
    'profile': 'neutral',
    'settings': 'neutral',
    'accounts': 'neutral',
    'categories': 'neutral',
    'goals': 'neutral',
    'import-csv': 'neutral',
  };

  // Default: 'dashboard'. The (auth) screens depend on this for brand
  // accent (Logo color + primary Button color). Auth screens never see
  // the sidebar (AppShell gates it on isAuthed), so a wrong tab focus
  // there is impossible — the only risk of an unmapped route would be
  // the sidebar showing while no entry is highlighted, which is now
  // avoided by mapping every authed top-level route above.
  let key: AccentKey = 'dashboard';
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && map[seg]) {
      key = map[seg];
      break;
    }
  }

  return { key, color: resolveAccent(key, resolvedScheme) };
}

/**
 * Returns the color for an accent key, resolving `neutral` against the
 * current theme so it stays readable in both modes. Pure helper — used by
 * Sidebar nav items to compute per-item colors without each item having to
 * call usePageAccent again.
 */
export function resolveAccent(
  key: AccentKey,
  resolvedScheme: 'light' | 'dark',
): string {
  if (key === 'neutral') {
    return resolvedScheme === 'dark'
      ? tokens.surface['dark-fg']
      : tokens.surface['light-fg'];
  }
  return tokens.accent[key];
}
