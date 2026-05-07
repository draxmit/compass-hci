import type {
  Budget, BudgetGroup, BudgetStyle, Category, CategoryMonthTotal,
} from '@compass/shared-types';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { Check, ChevronRight, FileText, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { updateUserDoc } from '@/services/firebase';
import { listBudgets, subscribeBudgets, deleteBudget, upsertBudget } from '@/services/firestore/budgetsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import { listMonthTotals, subscribeMonthTotals } from '@/services/firestore/categoryMonthTotalsService';
import { listTransactions } from '@/services/firestore/transactionsService';
import { useAuthStore, useAuthUser, useUserDoc } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatAmountInput, minorToInputText, parseAmountInput } from '@/shared/utils/amountInput';
import {
  computeEnvelopeBalances, computeFiftyThirtyTwentyBuckets, sumMonthIncome,
} from '@/shared/utils/budgetStyles';
import type { EnvelopeBalance } from '@/shared/utils/budgetStyles';
import { formatDate } from '@/shared/utils/formatDate';
import { formatIDR } from '@/shared/utils/formatIDR';
import { formatPercent } from '@/shared/utils/formatPercent';

const STYLES: readonly BudgetStyle[] = ['monthly_limit', 'envelope', 'fifty_thirty_twenty'];

/**
 * (tabs)/budgets.tsx — set monthly limits per category, see real-time
 * progress against `category_month_totals` (denormalised in T6/T7).
 *
 * Per ADR-10:
 *   - Only `monthly_limit` style is selectable in v1; envelope + 50/30/20
 *     are visible-but-greyed.
 *   - One doc per (yearMonth, categoryId) under workspaces/{wid}/budgets,
 *     joined to category_month_totals via the same id shape.
 *   - Inline edit pattern: tap row → expand → TextField + Save / Cancel /
 *     Delete buttons. Only one row expanded at a time.
 *   - Empty-state branches gated on `allLoaded` to avoid flash on cold open.
 */
export default function BudgetsScreen() {
  const { t, i18n } = useTranslation(['budgets', 'common']);
  const router = useRouter();
  const appAlert = useAppAlert();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const yearMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const monthLabel = useMemo(() => {
    const d = new Date(`${yearMonth}-01T00:00:00`);
    return formatDate(d, 'long-month', lang);
  }, [yearMonth, lang]);

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [monthTotals, setMonthTotals] = useState<CategoryMonthTotal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgetsLoaded, setBudgetsLoaded] = useState(false);
  const [monthTotalsLoaded, setMonthTotalsLoaded] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  // Single expanded-row id; tapping a different row collapses the previous.
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  // Budget style is now persisted on userDoc (ADR-21). Falls back to
  // 'monthly_limit' until the doc is loaded — that's also the v1 default
  // for legacy users.
  const userDoc = useUserDoc();
  const selectedStyle: BudgetStyle = userDoc?.budgetStyle ?? 'monthly_limit';

  // Auxiliary data needed by the envelope + 50/30/20 views, fetched
  // one-shot since they're snapshot reads (last month is immutable).
  const [lastMonthBudgets, setLastMonthBudgets] = useState<Budget[]>([]);
  const [lastMonthTotals, setLastMonthTotals] = useState<CategoryMonthTotal[]>([]);
  const [monthIncomeMinor, setMonthIncomeMinor] = useState<number>(0);

  const lastYearMonth = useMemo(() => {
    const d = new Date(`${yearMonth}-01T00:00:00`);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [yearMonth]);

  useEffect(() => {
    if (!wid) return;
    const unsubB = subscribeBudgets(wid, yearMonth, (data) => {
      setBudgets(data);
      setBudgetsLoaded(true);
    });
    const unsubM = subscribeMonthTotals(wid, yearMonth, (data) => {
      setMonthTotals(data);
      setMonthTotalsLoaded(true);
    });
    const unsubC = subscribeCategories(wid, (data) => {
      setCategories(data);
      setCategoriesLoaded(true);
    });
    return () => { unsubB(); unsubM(); unsubC(); };
  }, [wid, yearMonth]);

  // Last month's budgets + totals — one-shot, used by envelope view to
  // compute carryover. The data is immutable past this month, so a
  // realtime subscription is wasteful.
  useEffect(() => {
    if (!wid || selectedStyle !== 'envelope') return;
    let cancelled = false;
    void Promise.all([
      listBudgets(wid, lastYearMonth),
      listMonthTotals(wid, lastYearMonth),
    ]).then(([lb, lt]) => {
      if (cancelled) return;
      setLastMonthBudgets(lb);
      setLastMonthTotals(lt);
    }).catch((err: unknown) => {
      console.warn('[budgets] envelope last-month fetch failed', err);
    });
    return () => { cancelled = true; };
  }, [wid, selectedStyle, lastYearMonth]);

  // This-month income — one-shot, drives the 50/30/20 bucket targets.
  // The 50-tx subscription on Recent isn't enough (income txs often fall
  // outside the recent slice), so we read by yearMonth here. Pass
  // orderByDate: false to skip the (yearMonth, date) composite-index
  // dependency — the income sum is order-agnostic.
  useEffect(() => {
    if (!wid || selectedStyle !== 'fifty_thirty_twenty') return;
    let cancelled = false;
    void listTransactions(wid, { yearMonth, orderByDate: false }).then((txs) => {
      if (cancelled) return;
      setMonthIncomeMinor(sumMonthIncome(txs, yearMonth));
    }).catch((err: unknown) => {
      console.warn('[budgets] 50/30/20 income fetch failed', err);
    });
    return () => { cancelled = true; };
  }, [wid, selectedStyle, yearMonth]);

  const allLoaded = budgetsLoaded && monthTotalsLoaded && categoriesLoaded;

  const budgetsByCategory = useMemo(() => {
    const map = new Map<string, Budget>();
    for (const b of budgets) map.set(b.categoryId, b);
    return map;
  }, [budgets]);

  const spendByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of monthTotals) map.set(m.categoryId, m.totalIDR);
    return map;
  }, [monthTotals]);

  // Categories eligible for budgeting — non-archived, child categories
  // only (not the parent groups). Sort by order for stable display.
  const eligibleCategories = useMemo(() => {
    return categories
      .filter((c) => !c.isArchived && c.parentId !== null)
      .sort((a, b) => a.order - b.order);
  }, [categories]);

  const budgetedCategories = useMemo(
    () => eligibleCategories.filter((c) => budgetsByCategory.has(c.id)),
    [eligibleCategories, budgetsByCategory],
  );
  const unbudgetedCategories = useMemo(
    () => eligibleCategories.filter((c) => !budgetsByCategory.has(c.id)),
    [eligibleCategories, budgetsByCategory],
  );

  const handleStylePress = (style: BudgetStyle) => {
    const uid = useAuthStore.getState().uid;
    if (!uid || style === selectedStyle) return;
    // Optimistic — the userDoc subscription will reconcile if the
    // write fails. selectedStyle is read directly from userDoc so the
    // next render reflects whatever the doc actually says.
    void updateUserDoc(uid, { budgetStyle: style }).catch((err: unknown) => {
      console.warn('[budgets] style write failed', err);
    });
  };

  const handleSave = async (categoryId: string, limitMinor: number) => {
    if (!wid) return;
    if (limitMinor <= 0) {
      appAlert(t('budgets:title'), t('budgets:errors.invalidLimit'));
      return;
    }
    try {
      // Tag the budget with the active style + matching rollover policy
      // so the category_month_totals join can later be interpreted
      // correctly. Envelope = carry_over; monthly_limit = none. The
      // 50/30/20 view doesn't write per-category budgets at all.
      await upsertBudget(wid, {
        yearMonth,
        categoryId,
        style: selectedStyle === 'envelope' ? 'envelope' : 'monthly_limit',
        limitMinor,
        rolloverPolicy: selectedStyle === 'envelope' ? 'carry_over' : 'none',
      });
      setExpandedCategoryId(null);
    } catch (err) {
      console.warn('[budgets] upsert failed', err);
      appAlert(t('budgets:title'), t('budgets:errors.saveFailed'));
    }
  };

  const handleDelete = (categoryId: string) => {
    if (!wid) return;
    appAlert(
      t('budgets:actions.deleteConfirmTitle'),
      t('budgets:actions.deleteConfirmBody'),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('budgets:actions.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBudget(wid, yearMonth, categoryId);
              setExpandedCategoryId(null);
            } catch (err) {
              console.warn('[budgets] delete failed', err);
              appAlert(t('budgets:title'), t('budgets:errors.deleteFailed'));
            }
          },
        },
      ],
    );
  };

  const totallyEmpty = allLoaded && eligibleCategories.length === 0;
  const noBudgetsYet = allLoaded && budgetedCategories.length === 0 && eligibleCategories.length > 0;

  // Envelope balances — only computed when the envelope style is
  // active. Includes per-category (limit + rollover - spent).
  const envelopeBalances = useMemo<Map<string, EnvelopeBalance>>(() => {
    if (selectedStyle !== 'envelope') return new Map();
    return computeEnvelopeBalances(
      budgets, lastMonthBudgets, monthTotals, lastMonthTotals,
    );
  }, [selectedStyle, budgets, lastMonthBudgets, monthTotals, lastMonthTotals]);

  // 50/30/20 buckets — only computed when that style is active.
  const fiftyBuckets = useMemo(() => {
    if (selectedStyle !== 'fifty_thirty_twenty') return [];
    return computeFiftyThirtyTwentyBuckets(
      monthIncomeMinor, monthTotals, categories,
    );
  }, [selectedStyle, monthIncomeMinor, monthTotals, categories]);

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
      <View className="self-center w-full max-w-md lg:max-w-3xl">
        <Text className="font-sans-medium text-xs uppercase tracking-wider mb-1" style={{ color: mutedColor }}>
          {t('budgets:subtitleMonth', { month: monthLabel })}
        </Text>

        {/* Style selector strip — segmented buttons. Only monthly_limit is
            tappable in v1; the other two show a 'Coming in v2' alert. */}
        <View
          className="flex-row mb-6 mt-3"
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 10,
            padding: 4,
            gap: 4,
          }}
        >
          {STYLES.map((style) => {
            const active = selectedStyle === style;
            return (
              <Pressable
                key={style}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => handleStylePress(style)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: active ? tokens.accent.budgets + '22' : 'transparent',
                }}
              >
                <Text
                  className="font-sans-medium text-xs"
                  style={{ color: active ? tokens.accent.budgets : mutedColor }}
                  numberOfLines={1}
                >
                  {t(
                    style === 'monthly_limit'
                      ? 'budgets:styles.monthlyLimit'
                      : style === 'envelope'
                        ? 'budgets:styles.envelope'
                        : 'budgets:styles.fiftyThirtyTwenty',
                  )}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {totallyEmpty ? (
          /* No categories at all — bounce user back to Profile to seed/add. */
          <Card padding="lg" className="items-center">
            <Text className="font-sans-bold text-lg text-center mb-2" style={{ color: fgColor }}>
              {t('budgets:empty.noCategoriesYet')}
            </Text>
          </Card>
        ) : null}

        {!totallyEmpty && allLoaded && selectedStyle === 'fifty_thirty_twenty' ? (
          /* 50/30/20 view — three bucket cards + income header. The
              per-category budgeted/unbudgeted lists are hidden in this
              style; budgets are by group, not by category. */
          <View>
            {/* Income header */}
            <Card padding="lg" className="mb-4">
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
                {t('budgets:fiftyThirtyTwenty.incomeLabel')}
              </Text>
              <Text
                className="font-mono tabular-nums text-2xl"
                style={{ color: fgColor }}
              >
                {formatIDR(monthIncomeMinor, lang)}
              </Text>
              <Text
                className="font-sans text-xs mt-1"
                style={{ color: mutedColor }}
              >
                {monthIncomeMinor > 0
                  ? t('budgets:fiftyThirtyTwenty.incomeHint')
                  : t('budgets:fiftyThirtyTwenty.incomeEmpty')}
              </Text>
            </Card>
            {/* Three bucket cards */}
            {fiftyBuckets.map((bucket) => (
              <BucketCard
                key={bucket.group}
                group={bucket.group}
                ratio={bucket.ratio}
                targetMinor={bucket.targetMinor}
                spentMinor={bucket.spentMinor}
                isDark={isDark}
                lang={lang}
                fgColor={fgColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
                t={t}
              />
            ))}
          </View>
        ) : null}

        {!totallyEmpty && allLoaded && selectedStyle !== 'fifty_thirty_twenty' ? (
          <>
            {/* Envelope mode hero — total available across categories,
                broken into base budget + carry-over from last month so
                the user immediately sees what makes envelope different
                from monthly_limit. Only renders in envelope mode. */}
            {selectedStyle === 'envelope' ? (
              <Card padding="lg" className="mb-4">
                <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
                  {t('budgets:envelope.totalAvailableLabel')}
                </Text>
                {(() => {
                  const baseSum = budgets.reduce((s, b) => s + b.limitMinor, 0);
                  const rollSum = [...envelopeBalances.values()]
                    .reduce((s, e) => s + e.rolloverMinor, 0);
                  return (
                    <>
                      <Text
                        className="font-mono tabular-nums text-2xl"
                        style={{ color: fgColor }}
                      >
                        {formatIDR(baseSum + rollSum, lang)}
                      </Text>
                      <Text
                        className="font-sans text-xs mt-1"
                        style={{ color: mutedColor }}
                      >
                        {t('budgets:envelope.breakdown', {
                          base: formatIDR(baseSum, lang),
                          rollover: formatIDR(rollSum, lang),
                        })}
                      </Text>
                    </>
                  );
                })()}
              </Card>
            ) : null}

            {/* Budgeted section */}
            {budgetedCategories.length > 0 ? (
              <View className="mb-6">
                <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
                  {t('budgets:sections.budgeted')}
                </Text>
                <Card padding="none">
                  {budgetedCategories.map((cat, idx) => (
                    <BudgetRow
                      key={cat.id}
                      category={cat}
                      budget={budgetsByCategory.get(cat.id)!}
                      spentMinor={spendByCategory.get(cat.id) ?? 0}
                      rolloverMinor={
                        selectedStyle === 'envelope'
                          ? envelopeBalances.get(cat.id)?.rolloverMinor ?? 0
                          : 0
                      }
                      showRollover={selectedStyle === 'envelope'}
                      expanded={expandedCategoryId === cat.id}
                      onToggle={() =>
                        setExpandedCategoryId((cur) => (cur === cat.id ? null : cat.id))
                      }
                      onSave={(limitMinor) => handleSave(cat.id, limitMinor)}
                      onDelete={() => handleDelete(cat.id)}
                      showDivider={idx > 0}
                      isDark={isDark}
                      lang={lang}
                      fgColor={fgColor}
                      mutedColor={mutedColor}
                      borderColor={borderColor}
                      t={t}
                    />
                  ))}
                </Card>
              </View>
            ) : null}

            {/* No-budgets-yet welcome — only when categories exist but no
                budgets set. Friendlier than rendering an empty section. */}
            {noBudgetsYet ? (
              <Card padding="lg" className="items-center mb-6">
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: tokens.accent.budgets + '22',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Plus size={24} color={tokens.accent.budgets} strokeWidth={2.4} />
                </View>
                <Text className="font-sans-bold text-lg text-center" style={{ color: fgColor }}>
                  {t('budgets:empty.noBudgetsYet')}
                </Text>
                <Text
                  className="font-sans text-sm text-center mt-2"
                  style={{ color: mutedColor, lineHeight: 20 }}
                >
                  {t('budgets:empty.noBudgetsBody')}
                </Text>
              </Card>
            ) : null}

            {/* Unbudgeted section — discovery surface. */}
            {unbudgetedCategories.length > 0 ? (
              <View className="mb-6">
                <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
                  {t('budgets:sections.unbudgeted')}
                </Text>
                <Card padding="none">
                  {unbudgetedCategories.map((cat, idx) => (
                    <UnbudgetedRow
                      key={cat.id}
                      category={cat}
                      expanded={expandedCategoryId === cat.id}
                      onToggle={() =>
                        setExpandedCategoryId((cur) => (cur === cat.id ? null : cat.id))
                      }
                      onSave={(limitMinor) => handleSave(cat.id, limitMinor)}
                      showDivider={idx > 0}
                      isDark={isDark}
                      lang={lang}
                      fgColor={fgColor}
                      mutedColor={mutedColor}
                      borderColor={borderColor}
                      t={t}
                    />
                  ))}
                </Card>
              </View>
            ) : null}

            {/* Footer link to monthly summary report. */}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('budgets:actions.viewReport')}
              onPress={() => router.push(`/report/${yearMonth}` as Href)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 12,
                marginTop: 8,
              }}
            >
              <FileText size={14} color={tokens.accent.budgets} />
              <Text className="font-sans-medium text-sm" style={{ color: tokens.accent.budgets }}>
                {t('budgets:actions.viewReport')}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

// ---------- BudgetRow ----------

type BudgetRowProps = {
  category: Category;
  budget: Budget;
  spentMinor: number;
  /** Rollover from last month (envelope only). 0 when not in
   * envelope mode or no rollover available. */
  rolloverMinor: number;
  /** Whether to show the rollover subtitle line. Set true only for
   * the envelope budget style; false for monthly_limit. */
  showRollover: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSave: (limitMinor: number) => void;
  onDelete: () => void;
  showDivider: boolean;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  t: TFunction;
};

function BudgetRow({
  category, budget, spentMinor, rolloverMinor, showRollover,
  expanded, onToggle, onSave, onDelete,
  showDivider, isDark, lang, fgColor, mutedColor, borderColor, t,
}: BudgetRowProps) {
  const [draft, setDraft] = useState('');

  // Pre-fill draft when row expands; clear when collapsed so the next
  // expand reads from the current limitMinor again.
  useEffect(() => {
    if (expanded) setDraft(minorToInputText(budget.limitMinor, lang));
    else setDraft('');
  }, [expanded, budget.limitMinor, lang]);

  // Effective limit for envelope = base + rollover. monthly_limit
  // ignores rolloverMinor (caller passes 0 / showRollover=false).
  const effectiveLimitMinor = budget.limitMinor + (showRollover ? rolloverMinor : 0);
  const ratio = effectiveLimitMinor === 0 ? 0 : spentMinor / effectiveLimitMinor;
  const overBudget = ratio > 1;
  const overByMinor = overBudget ? spentMinor - effectiveLimitMinor : 0;
  const fillRatio = Math.min(ratio, 1);
  const overflowRatio = overBudget ? Math.min(ratio - 1, 0.5) : 0; // cap visual overflow at +50%

  const accent = isDark ? '#fff' : tokens.surface['light-fg'];
  const dangerColor = tokens.semantic.danger;
  const fillColor = overBudget ? dangerColor : tokens.accent.budgets;

  const catColor = resolveCategoryColor(category.color, isDark ? 'dark' : 'light');

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: borderColor,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={category.name[lang]}
        onPress={onToggle}
        style={{ flexDirection: 'row', alignItems: 'center' }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: catColor + '22',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <CategoryIcon name={category.icon} color={catColor} size={16} />
        </View>
        <View style={{ flex: 1 }}>
          <Text className="font-sans-medium text-sm" style={{ color: fgColor }} numberOfLines={1}>
            {category.name[lang]}
          </Text>
          <Text className="font-mono tabular-nums text-xs mt-0.5" style={{ color: mutedColor }}>
            {formatIDR(spentMinor, lang)}{' '}
            <Text style={{ color: mutedColor }}>{t('budgets:row.of')}</Text>{' '}
            {formatIDR(effectiveLimitMinor, lang)}
          </Text>
        </View>
        {/* Rollover badge — envelope only. Sits next to the percent
            number on the right so it's visually adjacent to the
            progress data, not buried under the spent/of line. Bold
            green pill so the envelope-mode user immediately sees
            which rows carry surplus. */}
        {showRollover && rolloverMinor > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: tokens.semantic.positive + '22',
              borderWidth: 1,
              borderColor: tokens.semantic.positive + '55',
              marginRight: 8,
            }}
          >
            <Text className="font-sans-semibold" style={{ color: tokens.semantic.positive, fontSize: 10 }}>
              {'+'}
              {formatIDR(rolloverMinor, lang)}
            </Text>
          </View>
        ) : null}
        <Text
          className="font-mono tabular-nums text-sm"
          style={{ color: overBudget ? dangerColor : accent }}
        >
          {formatPercent(ratio, lang)}
        </Text>
      </Pressable>

      {/* Progress bar — fills to the limit, with an overflow sliver in
          danger when over budget. */}
      <View
        style={{
          height: 6,
          marginTop: 8,
          borderRadius: 3,
          backgroundColor: borderColor,
          overflow: 'hidden',
          flexDirection: 'row',
        }}
      >
        <View
          style={{
            width: `${fillRatio * 100}%`,
            backgroundColor: fillColor,
          }}
        />
        {overflowRatio > 0 ? (
          <View
            style={{
              width: `${overflowRatio * 100}%`,
              backgroundColor: dangerColor,
              opacity: 0.5,
            }}
          />
        ) : null}
      </View>

      {overBudget ? (
        <Text className="font-sans text-xs mt-2" style={{ color: dangerColor }}>
          {t('budgets:row.overBudget', { amount: formatIDR(overByMinor, lang) })}
        </Text>
      ) : null}

      {expanded ? (
        <View style={{ marginTop: 12 }}>
          <TextField
            label=""
            value={draft}
            onChangeText={(text) => setDraft(formatAmountInput(text, lang))}
            placeholder={t('budgets:row.limitPlaceholder')}
            keyboardType="numeric"
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('budgets:actions.save')}
              onPress={() => onSave(parseAmountInput(draft, lang))}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: tokens.accent.budgets,
                minHeight: 44,
              }}
            >
              <Check size={14} color="#fff" />
              <Text className="font-sans-medium text-white text-sm">
                {t('budgets:actions.save')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.cancel')}
              onPress={onToggle}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                minHeight: 44,
              }}
            >
              <X size={14} color={fgColor} />
              <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                {t('common:actions.cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('budgets:actions.delete')}
              onPress={onDelete}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: dangerColor,
                minHeight: 44,
              }}
            >
              <Trash2 size={14} color={dangerColor} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------- UnbudgetedRow ----------

type UnbudgetedRowProps = {
  category: Category;
  expanded: boolean;
  onToggle: () => void;
  onSave: (limitMinor: number) => void;
  showDivider: boolean;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  t: TFunction;
};

function UnbudgetedRow({
  category, expanded, onToggle, onSave,
  showDivider, isDark, lang, fgColor, mutedColor, borderColor, t,
}: UnbudgetedRowProps) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!expanded) setDraft('');
  }, [expanded]);

  const catColor = resolveCategoryColor(category.color, isDark ? 'dark' : 'light');

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: borderColor,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={category.name[lang]}
        onPress={onToggle}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            backgroundColor: catColor + '22',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <CategoryIcon name={category.icon} color={catColor} size={14} />
        </View>
        <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }} numberOfLines={1}>
          {category.name[lang]}
        </Text>
        {expanded ? (
          <Pencil size={14} color={mutedColor} />
        ) : (
          <ChevronRight size={14} color={mutedColor} />
        )}
      </Pressable>

      {expanded ? (
        <View style={{ marginTop: 12 }}>
          <TextField
            label={t('budgets:row.addLimit')}
            value={draft}
            onChangeText={(text) => setDraft(formatAmountInput(text, lang))}
            placeholder={t('budgets:row.limitPlaceholder')}
            keyboardType="numeric"
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('budgets:actions.save')}
              onPress={() => onSave(parseAmountInput(draft, lang))}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: tokens.accent.budgets,
                minHeight: 44,
              }}
            >
              <Check size={14} color="#fff" />
              <Text className="font-sans-medium text-white text-sm">
                {t('budgets:actions.save')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.cancel')}
              onPress={onToggle}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                minHeight: 44,
              }}
            >
              <X size={14} color={fgColor} />
              <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                {t('common:actions.cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------- BucketCard (50/30/20 view) ----------

type BucketCardProps = {
  group: BudgetGroup;
  ratio: number;
  targetMinor: number;
  spentMinor: number;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  t: TFunction;
};

/**
 * One of the three 50/30/20 bucket cards — Needs (50%), Wants (30%),
 * or Savings (20%). Renders title + ratio chip + spend/target +
 * progress bar. Shares visual conventions with BudgetRow's progress
 * bar (capped overflow sliver in danger when over target).
 */
function BucketCard({
  group, ratio, targetMinor, spentMinor,
  isDark, lang, fgColor, mutedColor, borderColor, t,
}: BucketCardProps) {
  const dangerColor = tokens.semantic.danger;
  const accent = tokens.accent.budgets;

  const pct = targetMinor === 0 ? 0 : spentMinor / targetMinor;
  const overTarget = pct > 1;
  const overByMinor = overTarget ? spentMinor - targetMinor : 0;
  const fillRatio = targetMinor === 0 ? 0 : Math.min(pct, 1);
  const overflowRatio = overTarget ? Math.min(pct - 1, 0.5) : 0;
  const fillColor = overTarget ? dangerColor : accent;

  return (
    <Card padding="lg" className="mb-3">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Text className="font-sans-semibold text-base" style={{ color: fgColor }}>
            {t(`budgets:fiftyThirtyTwenty.groups.${group}`)}
          </Text>
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 4,
              borderWidth: 1,
              borderColor,
            }}
          >
            <Text className="font-sans-semibold" style={{ color: mutedColor, fontSize: 10 }}>
              {Math.round(ratio * 100)}%
            </Text>
          </View>
        </View>
        <Text
          className="font-mono tabular-nums text-sm"
          style={{ color: overTarget ? dangerColor : fgColor }}
        >
          {targetMinor > 0 ? formatPercent(pct, lang) : '—'}
        </Text>
      </View>

      <Text className="font-mono tabular-nums text-xs" style={{ color: mutedColor }}>
        {formatIDR(spentMinor, lang)}{' '}
        <Text>{t('budgets:row.of')}</Text>{' '}
        {formatIDR(targetMinor, lang)}
      </Text>

      <View
        style={{
          height: 6,
          marginTop: 10,
          borderRadius: 3,
          backgroundColor: borderColor,
          overflow: 'hidden',
          flexDirection: 'row',
        }}
      >
        <View
          style={{
            width: `${fillRatio * 100}%`,
            backgroundColor: fillColor,
          }}
        />
        {overflowRatio > 0 ? (
          <View
            style={{
              width: `${overflowRatio * 100}%`,
              backgroundColor: dangerColor,
              opacity: 0.5,
            }}
          />
        ) : null}
      </View>

      {overTarget ? (
        <Text className="font-sans text-xs mt-2" style={{ color: dangerColor }}>
          {t('budgets:row.overBudget', { amount: formatIDR(overByMinor, lang) })}
        </Text>
      ) : null}

      <Text className="font-sans text-xs mt-3" style={{ color: mutedColor, lineHeight: 16 }}>
        {t(`budgets:fiftyThirtyTwenty.hints.${group}`)}
      </Text>
    </Card>
  );
}
