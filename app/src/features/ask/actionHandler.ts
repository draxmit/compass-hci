import type { Router } from 'expo-router';

import type { SuggestedAction } from './types';

/**
 * Routes a tapped `SuggestedAction` to the appropriate Compass screen
 * with pre-filled query params. NEVER mutates user data directly —
 * the destination screen renders a confirmation form.
 *
 * Safe-list of `navigate.target` paths is enforced here so an over-
 * imaginative LLM can't link to `/admin` or external URLs.
 */

const NAVIGATE_ALLOWLIST = new Set([
  '/',
  '/transactions',
  '/budgets',
  '/insights',
  '/goals',
  '/accounts',
  '/categories',
  '/profile',
  '/settings',
]);

export function handleAction(router: Router, action: SuggestedAction): void {
  switch (action.type) {
    case 'createBudget':
      // Lands on /budgets with the category + amount pre-filled. The
      // budgets screen reads `prefillCategoryId` and `prefillLimitMinor`
      // (added separately in the budgets edit-panel wiring).
      router.push({
        pathname: '/budgets',
        params: {
          prefillCategoryId: action.categoryId,
          prefillLimitMinor: String(action.amountMinor),
        },
      });
      return;
    case 'viewTransactions': {
      const params: Record<string, string> = {};
      if (action.filter.categoryId) {
        params.prefillCategoryId = action.filter.categoryId;
      }
      if (action.filter.dateRange) {
        params.prefillDateRange = action.filter.dateRange;
      }
      router.push({ pathname: '/transactions', params });
      return;
    }
    case 'navigate': {
      // Strip query strings before allow-list check.
      const pathOnly = action.target.split('?')[0]?.split('#')[0] ?? '';
      if (!NAVIGATE_ALLOWLIST.has(pathOnly)) {
        // Silent no-op — the allow-list was tripped. The chat UI
        // could surface a "couldn't open this" toast but for v3
        // launch we just ignore (Gemini rarely abuses this).
        return;
      }
      router.push(action.target as never);
      return;
    }
  }
}
