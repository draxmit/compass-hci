import type {
  Account, Category, CategoryMonthTotal, Goal, Transaction,
} from '@compass/shared-types';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronRight, ChevronUp, Pin, Plus, Sparkles, Target } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { subscribeAccounts } from '@/services/firestore/accountsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import {
  listMonthTotals, subscribeMonthTotals,
} from '@/services/firestore/categoryMonthTotalsService';
import { subscribeGoal, subscribeGoals } from '@/services/firestore/goalsService';
import { subscribeRecent } from '@/services/firestore/transactionsService';
import { useAuthUser, useUserDoc } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { formatAmountForDisplay } from '@/shared/utils/formatAmountForDisplay';
import { formatDate, formatTimeUntil } from '@/shared/utils/formatDate';
import { formatIDR } from '@/shared/utils/formatIDR';
import { convertToIDRMinor } from '@/shared/utils/fxRates';

/**
 * (tabs)/index.tsx — Dashboard. The visibility surface the whole app is
 * anchored on (per master plan). Four cards from denormalised reads — no
 * aggregation queries — so the screen is O(1) per metric:
 *
 *   1. Net Worth    → sum accounts.currentBalance where included
 *   2. This Month   → sum month_totals + delta vs last month
 *   3. Top 3        → sort month_totals desc, slice 3
 *   4. Recent       → subscribeRecent(5)
 *
 * Plus a Goal placeholder line until T10 onboarding lands the real value.
 *
 * No charts library — simple capsule + horizontal bar Views handle v1's
 * visual needs. victory-native is deferred to v2 polish (per ADR-09 §3).
 */
export default function DashboardScreen() {
  const { t, i18n } = useTranslation(['dashboard', 'transactions', 'goals', 'common']);
  const router = useRouter();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;
  const userDoc = useUserDoc();
  const displayInIDR = userDoc?.displayInIDR ?? false;
  const pinnedGoalId = userDoc?.pinnedGoalId ?? null;
  const [pinnedGoal, setPinnedGoal] = useState<Goal | null>(null);
  // All goals — needed for the expanded view of the Goals section.
  // Subscription is cheap (typical user has 1–6 goals).
  const [allGoals, setAllGoals] = useState<Goal[]>([]);
  const [goalsExpanded, setGoalsExpanded] = useState(false);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [monthTotals, setMonthTotals] = useState<CategoryMonthTotal[]>([]);
  const [lastMonthTotals, setLastMonthTotals] = useState<CategoryMonthTotal[]>([]);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);

  // Per-subscription "first emission landed" flags. Without these the
  // initial render sees [] for everything and triggers the welcome /
  // empty-state branches for ~50–100 ms before Firestore's first
  // emission lands — a "wrong UI flashes then real UI paints" effect.
  // Gating the empty-state UI on allLoaded keeps the page blank during
  // the loading window instead.
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [monthTotalsLoaded, setMonthTotalsLoaded] = useState(false);
  const [recentLoaded, setRecentLoaded] = useState(false);

  const { thisYearMonth, lastYearMonth } = useMemo(() => yearMonths(), []);

  useEffect(() => {
    if (!wid) return;
    const unsubA = subscribeAccounts(wid, (data) => {
      setAccounts(data);
      setAccountsLoaded(true);
    });
    const unsubC = subscribeCategories(wid, (data) => {
      setCategories(data);
      setCategoriesLoaded(true);
    });
    const unsubM = subscribeMonthTotals(wid, thisYearMonth, (data) => {
      setMonthTotals(data);
      setMonthTotalsLoaded(true);
    });
    const unsubR = subscribeRecent(wid, 5, (data) => {
      setRecentTxs(data);
      setRecentLoaded(true);
    });
    // Last month is one-shot — used only for the delta computation, not
    // realtime. Not part of the loaded-gate; if it lands a frame after
    // the others the delta line just briefly reads "no change", which is
    // acceptable.
    listMonthTotals(wid, lastYearMonth)
      .then(setLastMonthTotals)
      .catch((err: unknown) => console.warn('[dashboard] listMonthTotals(last) failed', err));
    return () => { unsubA(); unsubC(); unsubM(); unsubR(); };
  }, [wid, thisYearMonth, lastYearMonth]);

  // Pinned-goal subscription is keyed on the id so it tears down +
  // re-subscribes when the user pins a different goal. Defensively
  // clears local state when the goal id is null. If the listener
  // reports `null` (goal was deleted out from under us) we still clear
  // the local state — pinnedGoalId is left as-is for the auth-store to
  // reconcile so we don't fight a race with the userDoc subscription.
  useEffect(() => {
    if (!wid || !pinnedGoalId) {
      setPinnedGoal(null);
      return;
    }
    const unsub = subscribeGoal(wid, pinnedGoalId, setPinnedGoal);
    return () => unsub();
  }, [wid, pinnedGoalId]);

  // All goals — feeds the expanded state of the Goals section.
  useEffect(() => {
    if (!wid) return;
    const unsub = subscribeGoals(wid, setAllGoals);
    return () => unsub();
  }, [wid]);

  const allLoaded = accountsLoaded && categoriesLoaded && monthTotalsLoaded && recentLoaded;

  // ---- Derived values ----
  const includedAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived && a.includedInNetWorth),
    [accounts],
  );
  // Net worth is always IDR-denominated. Each non-IDR balance is
  // converted via the FX snapshot before summing. Credit cards are
  // liabilities (ADR-22) — their positive 'owed' balance subtracts
  // from net worth.
  const netWorth = useMemo(
    () => includedAccounts.reduce((s, a) => {
      const idr = convertToIDRMinor(a.currentBalance, a.currency);
      return a.type === 'credit_card' ? s - idr : s + idr;
    }, 0),
    [includedAccounts],
  );

  const thisMonthSpent = useMemo(
    () => monthTotals.reduce((s, m) => s + m.totalIDR, 0),
    [monthTotals],
  );
  const lastMonthSpent = useMemo(
    () => lastMonthTotals.reduce((s, m) => s + m.totalIDR, 0),
    [lastMonthTotals],
  );
  const monthDelta = thisMonthSpent - lastMonthSpent;

  const top3 = useMemo(
    () => [...monthTotals].sort((a, b) => b.totalIDR - a.totalIDR).slice(0, 3),
    [monthTotals],
  );
  const top3Max = top3[0]?.totalIDR ?? 0;

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  // Aggregate empty checks — let us show a single warm welcome instead
  // of three separate "no X yet" lines stacked on a fresh user. Both
  // gated on allLoaded so the welcome cards never paint during the
  // ~50–100 ms loading window before Firestore's first emission.
  const trulyEmpty = allLoaded && includedAccounts.length === 0 && recentTxs.length === 0;
  const noTxsButHasAccounts = allLoaded && includedAccounts.length > 0 && recentTxs.length === 0;

  if (trulyEmpty) {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
        <View className="self-center w-full max-w-md lg:max-w-3xl">
          <Card padding="lg" className="items-center mt-6">
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: tokens.accent.dashboard + '22',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Sparkles size={28} color={tokens.accent.dashboard} strokeWidth={2.2} />
            </View>
            <Text className="font-sans-bold text-2xl text-center" style={{ color: fgColor }}>
              {t('dashboard:welcome.title')}
            </Text>
            <Text
              className="font-sans text-sm text-center mt-3 mb-6"
              style={{ color: mutedColor, lineHeight: 20 }}
            >
              {t('dashboard:welcome.body')}
            </Text>
            <View className="flex-row gap-2 self-stretch">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('dashboard:welcome.addAccountCta')}
                onPress={() => router.push('/accounts')}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: tokens.accent.dashboard,
                  minHeight: 44,
                }}
              >
                <Plus size={14} color="#fff" />
                <Text className="font-sans-medium text-white text-sm">
                  {t('dashboard:welcome.addAccountCta')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('dashboard:welcome.addTransactionCta')}
                onPress={() =>
                  router.replace({ pathname: '/transaction/new', params: { from: '/' } })
                }
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'],
                  minHeight: 44,
                }}
              >
                <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                  {t('dashboard:welcome.addTransactionCta')}
                </Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
      <View className="self-center w-full max-w-md lg:max-w-3xl">
        {/* Net Worth — flat editorial layout. Section label in page column,
            hero number floats freely (no card). */}
        <View className="mb-8">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
            {t('dashboard:cards.netWorth')}
          </Text>
          {!allLoaded ? null : includedAccounts.length === 0 ? (
            <View>
              <Text className="font-sans text-sm mb-3" style={{ color: mutedColor }}>
                {t('dashboard:empty.netWorth')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('dashboard:empty.addAccount')}
                onPress={() => router.push('/accounts')}
                style={{
                  flexDirection: 'row',
                  alignSelf: 'flex-start',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: tokens.accent.dashboard,
                  minHeight: 36,
                }}
              >
                <Plus size={14} color="#fff" />
                <Text className="font-sans-medium text-white text-sm">
                  {t('dashboard:empty.addAccount')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text
                className="font-mono tabular-nums text-4xl"
                style={{ color: fgColor }}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {formatIDR(netWorth)}
              </Text>
              <Text className="font-sans text-xs mt-2" style={{ color: mutedColor }}>
                {t('dashboard:cards.acrossNAccounts', {
                  count: includedAccounts.length,
                  context: includedAccounts.length === 1 ? 'one' : 'other',
                })}
              </Text>
            </>
          )}
        </View>

        {/* Goals section — collapsible only when there's more than 1
            goal. With 0–1 goals there's nothing to expand TO, so the
            toggle would be a no-op confusion. The whole section is
            the entry point to /goals (Profile no longer carries a
            link, per user feedback that Goals were too hidden). */}
        {allLoaded && (allGoals.length > 0 || pinnedGoal) ? (
          <View className="mb-8">
            {allGoals.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: goalsExpanded }}
                onPress={() => setGoalsExpanded((cur) => !cur)}
                className="flex-row items-center justify-between mb-3"
              >
                <Text
                  className="font-sans-medium text-xs uppercase tracking-wider"
                  style={{ color: mutedColor }}
                >
                  {t('dashboard:goals.label')}
                </Text>
                <View className="flex-row items-center" style={{ gap: 4 }}>
                  <Text className="font-sans text-xs" style={{ color: mutedColor }}>
                    {goalsExpanded
                      ? t('dashboard:goals.collapse')
                      : t('dashboard:goals.expand', { count: allGoals.length })}
                  </Text>
                  {goalsExpanded ? (
                    <ChevronUp size={14} color={mutedColor} />
                  ) : (
                    <ChevronDown size={14} color={mutedColor} />
                  )}
                </View>
              </Pressable>
            ) : (
              <Text
                className="font-sans-medium text-xs uppercase tracking-wider mb-3"
                style={{ color: mutedColor }}
              >
                {t('dashboard:goals.label')}
              </Text>
            )}

            {/* Render rule:
                - 0 goals: handled by the empty-state branch below
                - 1 goal: always show that single goal (no toggle)
                - 2+ goals: collapsed → pinned (or first if none pinned),
                            expanded → all */}
            {(() => {
              const showAll = allGoals.length <= 1 || goalsExpanded;
              const visibleGoals = showAll
                ? allGoals
                : pinnedGoal
                  ? [pinnedGoal]
                  : allGoals.length > 0
                    ? [allGoals[0]!]
                    : [];
              if (visibleGoals.length === 0) {
                return (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push('/goals')}
                    style={{
                      paddingVertical: 16,
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: borderColor,
                      alignItems: 'center',
                    }}
                  >
                    <Text className="font-sans text-xs" style={{ color: mutedColor }}>
                      {t('dashboard:goals.empty')}
                    </Text>
                  </Pressable>
                );
              }
              return (
                <Card padding="none">
                  {visibleGoals.map((g, idx) => (
                    <DashboardGoalRow
                      key={g.id}
                      goal={g}
                      isPinned={g.id === pinnedGoalId}
                      displayInIDR={displayInIDR}
                      lang={lang}
                      isDark={isDark}
                      mutedColor={mutedColor}
                      borderColor={borderColor}
                      showDivider={idx > 0}
                      onPress={() => router.push('/goals')}
                      t={t}
                    />
                  ))}
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push('/goals')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      paddingVertical: 12,
                      borderTopWidth: 1,
                      borderTopColor: borderColor,
                    }}
                  >
                    <Text className="font-sans-medium text-xs" style={{ color: tokens.accent.dashboard }}>
                      {t('dashboard:goals.manageLink')}
                    </Text>
                    <ChevronRight size={12} color={tokens.accent.dashboard} />
                  </Pressable>
                </Card>
              );
            })()}
          </View>
        ) : null}

        {noTxsButHasAccounts ? (
          /* Has Net Worth above; the other three sections (This Month,
             Top Categories, Recent) all have nothing meaningful to show.
             Replace them with one consolidated 'first transaction' card
             instead of three sparse 'no X yet' lines. */
          <Card padding="lg" className="items-center mt-2">
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: tokens.accent.dashboard + '22',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Plus size={24} color={tokens.accent.dashboard} strokeWidth={2.4} />
            </View>
            <Text className="font-sans-bold text-lg text-center" style={{ color: fgColor }}>
              {t('dashboard:firstTransaction.title')}
            </Text>
            <Text
              className="font-sans text-sm text-center mt-2 mb-4"
              style={{ color: mutedColor, lineHeight: 20 }}
            >
              {t('dashboard:firstTransaction.body')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('dashboard:firstTransaction.cta')}
              onPress={() =>
                router.replace({ pathname: '/transaction/new', params: { from: '/' } })
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: tokens.accent.dashboard,
                minHeight: 44,
              }}
            >
              <Plus size={14} color="#fff" />
              <Text className="font-sans-medium text-white text-sm">
                {t('dashboard:firstTransaction.cta')}
              </Text>
            </Pressable>
          </Card>
        ) : (
          <>
        {/* This Month — same pattern. */}
        <View className="mb-8">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
            {t('dashboard:cards.thisMonth')}
          </Text>
          {!allLoaded ? null : thisMonthSpent === 0 && lastMonthSpent === 0 ? (
            <Text className="font-sans text-sm" style={{ color: mutedColor }}>
              {t('dashboard:empty.thisMonth')}
            </Text>
          ) : (
            <>
              <Text
                className="font-mono tabular-nums text-3xl"
                style={{ color: fgColor }}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {formatIDR(thisMonthSpent)}
              </Text>
              <DeltaLine
                delta={monthDelta}
                lang={lang}
                mutedColor={mutedColor}
                t={t}
              />
            </>
          )}
        </View>

        {/* Top Categories — list of rows with share bars. No card; rows
            sit directly in the page column. */}
        <View className="mb-8">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('dashboard:cards.topCategories')}
          </Text>
          {!allLoaded ? null : top3.length === 0 ? (
            <Text className="font-sans text-sm" style={{ color: mutedColor }}>
              {t('dashboard:empty.topCategories')}
            </Text>
          ) : (
            top3.map((row, idx) => {
              const cat = categoriesById.get(row.categoryId);
              const tint = cat ? resolveCategoryColor(cat.color, isDark ? 'dark' : 'light') : mutedColor;
              const widthPct = top3Max > 0 ? (row.totalIDR / top3Max) * 100 : 0;
              return (
                <View key={row.categoryId} className={idx === top3.length - 1 ? '' : 'mb-3'}>
                  <View className="flex-row items-center mb-1">
                    {cat ? (
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          backgroundColor: tint + '22',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 8,
                        }}
                      >
                        <CategoryIcon name={cat.icon} color={tint} size={12} />
                      </View>
                    ) : null}
                    <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }} numberOfLines={1}>
                      {cat ? cat.name[lang] : row.categoryId}
                    </Text>
                    <Text
                      className="font-mono tabular-nums text-sm"
                      style={{ color: fgColor }}
                    >
                      {formatIDR(row.totalIDR)}
                    </Text>
                  </View>
                  <View
                    style={{
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'],
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      style={{
                        width: `${widthPct}%`,
                        height: '100%',
                        backgroundColor: tint,
                      }}
                    />
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Recent — keeps the card because it actually contains list rows
            that benefit from a unified container. */}
        <Card padding="none" className="mb-3">
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
            <Text className="font-sans-medium text-xs uppercase tracking-wider" style={{ color: mutedColor }}>
              {t('dashboard:cards.recent')}
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('dashboard:cards.seeAll')}
              // navigate (not push) — /transactions is a TAB, not a modal.
              // Pushing it would leave Dashboard underneath in the Stack and
              // break tab-bar focus; navigate cleanly switches tabs.
              onPress={() => router.navigate('/transactions')}
              hitSlop={6}
            >
              <Text className="font-sans-medium text-xs" style={{ color: tokens.accent.dashboard }}>
                {t('dashboard:cards.seeAll')}
              </Text>
            </Pressable>
          </View>
          {recentTxs.map((tx, idx) => (
            <RecentRow
              key={tx.id}
              tx={tx}
              accountsById={accountsById}
              categoriesById={categoriesById}
              isDark={isDark}
              lang={lang}
              fgColor={fgColor}
              mutedColor={mutedColor}
              displayInIDR={displayInIDR}
              showDivider={idx > 0}
              onPress={() => router.push(`/transaction/${tx.id}` as Href)}
              t={t}
            />
          ))}
        </Card>
          </>
        )}

        {/* Goal pill moved into the Net Worth card as a subtitle block —
            see the Net Worth section above. */}
      </View>
    </ScrollView>
  );
}

type DeltaLineProps = {
  delta: number;
  lang: Locale;
  mutedColor: string;
  t: TFunction;
};

function DeltaLine({ delta, mutedColor, t }: DeltaLineProps) {
  const abs = Math.abs(delta);
  if (delta === 0) {
    return (
      <Text className="font-sans text-xs mt-1" style={{ color: mutedColor }}>
        {t('dashboard:delta.same')} · {t('dashboard:cards.vsLastMonth')}
      </Text>
    );
  }
  const isUp = delta > 0;
  const color = isUp ? tokens.semantic.danger : tokens.semantic.positive;
  const key = isUp ? 'dashboard:delta.up' : 'dashboard:delta.down';
  return (
    <Text className="font-sans text-xs mt-1" style={{ color: mutedColor }}>
      <Text style={{ color }}>{t(key, { amount: formatIDR(abs) })}</Text>
      {' · '}
      {t('dashboard:cards.vsLastMonth')}
    </Text>
  );
}

type RecentRowProps = {
  tx: Transaction;
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  displayInIDR: boolean;
  showDivider: boolean;
  onPress: () => void;
  t: TFunction;
};

function RecentRow({
  tx, accountsById, categoriesById, isDark, lang, fgColor, mutedColor, displayInIDR, showDivider, onPress, t,
}: RecentRowProps) {
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const account = accountsById.get(tx.accountId);
  const splitCategory = tx.splits[0]?.categoryId
    ? categoriesById.get(tx.splits[0].categoryId)
    : null;

  let icon = splitCategory?.icon ?? account?.icon ?? 'tag';
  let tint = splitCategory?.color ?? account?.color ?? 'slate';
  if (tx.type === 'transfer' && account) {
    icon = account.icon;
    tint = account.color;
  }
  const swatch = resolveCategoryColor(tint, isDark ? 'dark' : 'light');

  const primary = tx.description?.trim()
    || splitCategory?.name[lang]
    || t(`transactions:entry.types.${tx.type}`);

  let amountColor = fgColor;
  let amountPrefix = '';
  if (tx.type === 'expense') {
    amountColor = tokens.semantic.danger;
    amountPrefix = '−';
  } else if (tx.type === 'income') {
    amountColor = tokens.semantic.positive;
    amountPrefix = '+';
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={primary}
      onPress={onPress}
      className="flex-row items-center px-4 py-3 min-h-[44px]"
      style={{ borderTopWidth: showDivider ? 1 : 0, borderTopColor: borderColor }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: swatch + '22',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <CategoryIcon name={icon} color={swatch} size={16} />
      </View>
      <View className="flex-1">
        <Text className="font-sans-medium text-sm" style={{ color: fgColor }} numberOfLines={1}>
          {primary}
        </Text>
        <Text className="font-sans text-xs" style={{ color: mutedColor }} numberOfLines={1}>
          {formatDate(new Date(tx.date), 'long', lang)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {(() => {
          const display = formatAmountForDisplay(
            tx.amount, tx.currency ?? 'IDR', displayInIDR, lang,
          );
          return (
            <>
              <Text
                className="font-mono tabular-nums text-sm font-sans-semibold"
                style={{ color: amountColor }}
              >
                {amountPrefix}
                {display.primary}
              </Text>
              {display.secondary ? (
                <Text
                  className="font-mono tabular-nums text-xs"
                  style={{ color: mutedColor, marginTop: 2 }}
                >
                  {display.secondary}
                </Text>
              ) : null}
            </>
          );
        })()}
      </View>
    </Pressable>
  );
}

/** Compute current + previous yearMonth in the device's local timezone. */
function yearMonths(): { thisYearMonth: string; lastYearMonth: string } {
  const now = new Date();
  const thisYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastYearMonth = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;
  return { thisYearMonth, lastYearMonth };
}

type DashboardGoalRowProps = {
  goal: Goal;
  isPinned: boolean;
  displayInIDR: boolean;
  lang: Locale;
  isDark: boolean;
  mutedColor: string;
  borderColor: string;
  showDivider: boolean;
  onPress: () => void;
  t: TFunction;
};

/**
 * Compact Dashboard goal row — name + percent + progress bar +
 * 'Rp X / Rp Y' line, with a pin badge when this goal is the
 * one driving the Net Worth subtitle. Used inside the collapsible
 * Goals section.
 */
function DashboardGoalRow({
  goal, isPinned, displayInIDR, lang, isDark, mutedColor, borderColor,
  showDivider, onPress, t,
}: DashboardGoalRowProps) {
  void isDark;
  void t;
  const accent = tokens.accent.dashboard;
  const hasTarget = goal.targetMinor > 0;
  const ratio = hasTarget
    ? Math.min(1, Math.max(0, goal.currentMinor / goal.targetMinor))
    : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={goal.name}
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: borderColor,
      }}
    >
      <View className="flex-row items-center mb-2" style={{ gap: 8 }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: accent + '22',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Target size={14} color={accent} />
        </View>
        <Text
          className="font-sans-semibold text-sm flex-1"
          style={{ color: accent }}
          numberOfLines={1}
        >
          {goal.name}
        </Text>
        {isPinned ? (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              backgroundColor: accent + '22',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Pin size={12} color={accent} fill={accent} />
          </View>
        ) : null}
        {hasTarget ? (
          <Text
            className="font-mono tabular-nums text-xs font-sans-semibold"
            style={{ color: accent }}
          >
            {Math.round(ratio * 100)}
            {'%'}
          </Text>
        ) : null}
      </View>
      {hasTarget ? (
        <>
          <View
            style={{
              height: 4,
              borderRadius: 999,
              backgroundColor: accent + '22',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.round(ratio * 100)}%`,
                height: '100%',
                backgroundColor: accent,
              }}
            />
          </View>
          <View className="flex-row items-baseline justify-between mt-1.5" style={{ gap: 8 }}>
            <Text
              className="font-mono tabular-nums text-xs"
              style={{ color: mutedColor }}
              numberOfLines={1}
            >
              {formatAmountForDisplay(goal.currentMinor, 'IDR', displayInIDR, lang).primary}
              {' / '}
              {formatAmountForDisplay(goal.targetMinor, 'IDR', displayInIDR, lang).primary}
            </Text>
            {goal.targetDate ? (() => {
              const remaining = formatTimeUntil(goal.targetDate, lang);
              return (
                <View className="flex-row items-baseline" style={{ gap: 4 }}>
                  <Text
                    className="font-sans text-xs"
                    style={{ color: mutedColor }}
                    numberOfLines={1}
                  >
                    {formatDate(new Date(`${goal.targetDate}T00:00:00`), 'medium', lang)}
                  </Text>
                  <Text
                    className="font-sans-medium text-xs"
                    style={{ color: remaining.past ? tokens.semantic.danger : accent }}
                  >
                    {'· '}{remaining.label}
                  </Text>
                </View>
              );
            })() : null}
          </View>
        </>
      ) : null}
      {/* Goals without a monetary target still benefit from showing
          the date deadline if one is set — render it as a thin line
          when there's no progress bar above. */}
      {!hasTarget && goal.targetDate ? (() => {
        const remaining = formatTimeUntil(goal.targetDate, lang);
        return (
          <View className="flex-row items-baseline mt-1" style={{ gap: 4 }}>
            <Text className="font-sans text-xs" style={{ color: mutedColor }}>
              {formatDate(new Date(`${goal.targetDate}T00:00:00`), 'medium', lang)}
            </Text>
            <Text
              className="font-sans-medium text-xs"
              style={{ color: remaining.past ? tokens.semantic.danger : accent }}
            >
              {'· '}{remaining.label}
            </Text>
          </View>
        );
      })() : null}
    </Pressable>
  );
}
