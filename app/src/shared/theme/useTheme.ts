import { useThemeContext } from './ThemeProvider';
import type { ResolvedScheme, ThemeMode } from './ThemeProvider';

export type { ResolvedScheme, ThemeMode };

/**
 * Convenience hook re-exporting the ThemeProvider context.
 * Returns `{ mode, setMode, resolvedScheme }`.
 */
export function useTheme() {
  return useThemeContext();
}
