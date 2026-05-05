import type { CategoryColor } from '@compass/shared-types';

/**
 * Curated 12-colour palette for categories (ADR-05 §5). Separate from the
 * page-accent palette in `tokens` (which is reserved for nav). Each entry
 * has light/dark hex values tuned for hairline-bordered cards over the
 * surface bg — saturation is dialled back for readability, not bright UI
 * accents.
 */
export const categoryColors: Record<CategoryColor, { light: string; dark: string }> = {
  red:    { light: '#dc2626', dark: '#f87171' },
  orange: { light: '#ea580c', dark: '#fb923c' },
  amber:  { light: '#d97706', dark: '#fbbf24' },
  yellow: { light: '#ca8a04', dark: '#facc15' },
  green:  { light: '#16a34a', dark: '#4ade80' },
  teal:   { light: '#0d9488', dark: '#2dd4bf' },
  cyan:   { light: '#0891b2', dark: '#22d3ee' },
  blue:   { light: '#2563eb', dark: '#60a5fa' },
  indigo: { light: '#4f46e5', dark: '#818cf8' },
  violet: { light: '#7c3aed', dark: '#a78bfa' },
  pink:   { light: '#db2777', dark: '#f472b6' },
  slate:  { light: '#475569', dark: '#94a3b8' },
};

export const CATEGORY_COLOR_KEYS = Object.keys(categoryColors) as CategoryColor[];

export function resolveCategoryColor(key: CategoryColor, scheme: 'light' | 'dark'): string {
  return categoryColors[key][scheme];
}
