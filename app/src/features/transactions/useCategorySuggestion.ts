import type { Account, Category } from '@compass/shared-types';
import { useEffect, useRef, useState } from 'react';

import { parseTextWithGemini } from '@/features/ask/geminiClient';
import type { ChatContext } from '@/features/ask/types';
import type { Locale } from '@/shared/i18n';

const DEBOUNCE_MS = 600;
const MIN_DESCRIPTION_CHARS = 4;

type Args = {
  description: string;
  /** Only fire when transaction type is 'expense' — income / transfers don't need a category. */
  type: string;
  /** When the user has already picked a category we don't suggest. */
  hasManualCategory: boolean;
  categories: Category[];
  accounts: Account[];
  lang: Locale;
};

export type CategorySuggestion = {
  suggested: Category | null;
  loading: boolean;
  /** Reset the suggestion (caller dismissed it without accepting). */
  dismiss: () => void;
};

/**
 * AI-powered category suggestion (#8). Watches the description field
 * on the transaction-entry form; when the user types more than a few
 * characters AND hasn't picked a category yet, debounce-call Gemini
 * /parse-text with just the description. If the LLM returns a
 * categoryId matching one of the user's actual categories, render
 * a "Suggested: Cinema · tap to apply" chip below the description.
 *
 * Falls back gracefully when Gemini is misconfigured / unreachable —
 * the suggestion stays null and the user just types as before.
 *
 * Deliberate scoping:
 *   - Skip on empty / short descriptions (<4 chars) — too noisy.
 *   - Skip on non-expense — income/transfer don't need categories.
 *   - Skip when the user has already picked one — suggestion would
 *     either confirm their choice (annoying) or contradict it
 *     (overstepping).
 *   - Cancel in-flight requests when a newer keystroke supersedes
 *     them via abort + ref-keyed query string.
 */
export function useCategorySuggestion({
  description, type, hasManualCategory, categories, accounts, lang,
}: Args): CategorySuggestion {
  const [suggested, setSuggested] = useState<Category | null>(null);
  const [loading, setLoading] = useState(false);
  // Track the most recent inflight query so stale responses (later
  // keystroke supersedes earlier one) get dropped.
  const inflightRef = useRef<string | null>(null);
  // Don't re-suggest a category the user explicitly dismissed for
  // this exact description value. Cleared when the description changes.
  const dismissedForDescRef = useRef<string | null>(null);

  useEffect(() => {
    setSuggested(null);
    if (type !== 'expense') return;
    if (hasManualCategory) return;
    const trimmed = description.trim();
    if (trimmed.length < MIN_DESCRIPTION_CHARS) return;
    if (dismissedForDescRef.current === trimmed) return;

    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      const queryKey = trimmed;
      inflightRef.current = queryKey;
      setLoading(true);
      // Minimal ChatContext — we only need the LLM to map a description
      // to one of the user's categories. Deliberately empty arrays for
      // the other context surfaces so the prompt stays focused + tokens
      // stay low (this is a per-keystroke call, not a chat turn).
      const ctx: ChatContext = {
        locale: lang,
        today: new Date().toISOString().slice(0, 10),
        totalBalanceMinor: 0,
        accounts: accounts.slice(0, 10).map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          subtype: a.subtype,
          balanceMinor: 0,
          currency: a.currency,
        })),
        budgets: [],
        goals: [],
        transactions: [],
        categoryTotals90d: categories.slice(0, 30).map((c) => ({
          categoryId: c.id,
          // Names are bilingual on the doc; send the user's active locale
          // so the prompt's category list lines up with how the user
          // would naturally describe it.
          categoryName: c.name[lang],
          totalSpentMinor: 0,
          count: 0,
        })),
      };
      void parseTextWithGemini(trimmed, ctx)
        .then((res) => {
          if (cancelled) return;
          if (inflightRef.current !== queryKey) return; // superseded
          const id = res.parsed.categoryId;
          if (!id) return;
          const match = categories.find((c) => c.id === id);
          if (match) setSuggested(match);
        })
        .catch(() => {
          // Worker may be misconfigured / offline; degrade silently.
        })
        .finally(() => {
          if (!cancelled && inflightRef.current === queryKey) {
            setLoading(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // accounts + categories are stable refs across the form's lifetime;
    // re-running on their identity churn would re-fire suggestions
    // unnecessarily. Lang re-runs deliberately so the prompt picks up
    // the user's current locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, type, hasManualCategory, lang]);

  const dismiss = () => {
    dismissedForDescRef.current = description.trim();
    setSuggested(null);
  };

  return { suggested, loading, dismiss };
}
