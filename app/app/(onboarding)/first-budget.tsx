import type { Category } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { upsertBudget } from '@/services/firestore/budgetsService';
import { listCategories } from '@/services/firestore/categoriesService';
import { useAuthStore } from '@/stores/authStore';
import {
  finishOnboarding, OnboardingShell,
} from '@/features/onboarding/OnboardingShell';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatAmountInput, parseAmountInput } from '@/shared/utils/amountInput';

/**
 * Step 4 — Set first budgets. Shows 6 popular Indonesian expense
 * categories (curated by name.id) with optional limit fields. On Done,
 * iterates the rows and creates a `Budget` doc for each one with a
 * positive limit, then sets `onboardingComplete: true` and routes to /.
 *
 * Per ADR-11 §4: a fixed curated list (not free-pick) — day-1 paralysis
 * mitigation. Full Budgets tab is a click away after onboarding ends.
 *
 * If a curated category is missing from the user's workspace (e.g.
 * preset seed somehow failed), that row is skipped silently — defensive
 * fall-through rather than a crash.
 */

const POPULAR_CATEGORY_NAME_IDS: readonly string[] = [
  'Warteg',
  'Cafe',
  'Grab',
  'Bioskop',
  'Pulsa',
  'Belanja Dapur',
];

type Row = {
  category: Category;
  limitText: string;
};

export default function FirstBudgetStep() {
  const { t, i18n } = useTranslation(['onboarding', 'common']);
  const router = useRouter();
  const appAlert = useAppAlert();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const uid = useAuthStore.getState().uid;
  const wid = uid ? `solo-${uid}` : null;

  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const yearMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Load the user's categories once (one-shot — doesn't change during a
  // session). Map the curated name.id list to the actual Firestore docs;
  // skip any that don't resolve.
  useEffect(() => {
    if (!wid) return;
    let cancelled = false;
    (async () => {
      try {
        const cats = await listCategories(wid);
        if (cancelled) return;
        const byNameId = new Map<string, Category>();
        for (const c of cats) byNameId.set(c.name.id, c);
        const matched: Row[] = [];
        for (const id of POPULAR_CATEGORY_NAME_IDS) {
          const cat = byNameId.get(id);
          if (cat) matched.push({ category: cat, limitText: '' });
        }
        setRows(matched);
      } catch (err) {
        console.warn('[onboarding] first-budget load failed', err);
      }
    })();
    return () => { cancelled = true; };
  }, [wid]);

  const handleLimitChange = (categoryId: string, text: string) => {
    const formatted = formatAmountInput(text, lang);
    setRows((cur) =>
      cur.map((r) => (r.category.id === categoryId ? { ...r, limitText: formatted } : r)),
    );
  };

  const handleDone = async () => {
    if (busy) return;
    if (!wid) return;
    setBusy(true);
    try {
      // Create budgets for any row with a positive limit. Sequential is
      // fine — small N (≤6), and upsertBudget is idempotent per (yearMonth,
      // categoryId) so concurrent writes wouldn't conflict anyway.
      for (const row of rows) {
        const limitMinor = parseAmountInput(row.limitText, lang);
        if (limitMinor > 0) {
          await upsertBudget(wid, {
            yearMonth,
            categoryId: row.category.id,
            style: 'monthly_limit',
            limitMinor,
            rolloverPolicy: 'none',
          });
        }
      }
      await finishOnboarding();
      router.replace('/');
    } catch (err) {
      console.warn('[onboarding] first-budget save failed', err);
      appAlert(t('onboarding:firstBudget.title'), t('onboarding:firstBudget.createFailed'));
      setBusy(false);
    }
  };

  return (
    <OnboardingShell
      step={4}
      title={t('onboarding:firstBudget.title')}
      body={t('onboarding:firstBudget.body')}
      primaryLabel={t('onboarding:actions.done')}
      onPrimary={handleDone}
      primaryBusy={busy}
    >
      {/* Compact single-row layout (icon + name + inline TextField). The
          earlier two-row card per category felt too tall — six cards
          forced a long scroll on mobile. Now each row is ~52 px. */}
      <View
        style={{
          borderWidth: 1,
          borderColor,
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {rows.map((row, idx) => {
          const cat = row.category;
          const catColor = resolveCategoryColor(cat.color, isDark ? 'dark' : 'light');
          return (
            <View
              key={cat.id}
              className="flex-row items-center"
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                gap: 10,
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: borderColor,
              }}
            >
              <View
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  backgroundColor: catColor + '22',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <CategoryIcon name={cat.icon} color={catColor} size={14} />
              </View>
              <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }} numberOfLines={1}>
                {cat.name[lang]}
              </Text>
              <View style={{ width: 132 }}>
                <TextField
                  label=""
                  value={row.limitText}
                  onChangeText={(text) => handleLimitChange(cat.id, text)}
                  placeholder={t('onboarding:firstBudget.perCategoryHint')}
                  keyboardType="numeric"
                />
              </View>
            </View>
          );
        })}
      </View>
      <Text className="font-sans text-xs mt-3" style={{ color: mutedColor }}>
        {t('onboarding:firstBudget.skipHint')}
      </Text>
    </OnboardingShell>
  );
}
