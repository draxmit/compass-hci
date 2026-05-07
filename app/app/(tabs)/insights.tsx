import type { Category, CategoryMonthTotal, Transaction } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Sparkles, TrendingUp, Zap,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { listCategories } from '@/services/firestore/categoriesService';
import { listMonthTotals } from '@/services/firestore/categoryMonthTotalsService';
import { listTransactions } from '@/services/firestore/transactionsService';
import { useAuthUser } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { formatDate } from '@/shared/utils/formatDate';
import { formatIDR } from '@/shared/utils/formatIDR';

/**
 * (tabs)/insights.tsx — patterns + anomalies surface (per ADR-13).
 *
 * Four sections, plain-language framing for non-technical users:
 *   1. 6-month trend bars
 *   2. What's notable this month (rule-based anomaly callouts, hidden if none)
 *   3. Calendar heatmap for the current month
 *   4. Day-of-week pattern bars
 *
 * Snapshot read pattern (one-shot Promise.all on mount). Insights is a
 * "review what happened" surface, not realtime — refreshing while the
 * user is reading would be distracting.
 *
 * No chart library — plain Views with computed widths/heights, matching
 * Dashboard's visualisation strategy.
 */

const TREND_MONTHS = 6 as const;
const ANOMALY_CATEGORY_RATIO = 1.5;
const ANOMALY_MIN_AMOUNT = 100_000_00;       // Rp 100k floor (minor units)
const ANOMALY_TX_RATIO = 3;
const ANOMALY_MAX_CALLOUTS = 4;

type AnomalyCategory = {
  kind: 'category';
  category: Category;
  current: number;
  baseline: number;
};
type AnomalyTransaction = {
  kind: 'transaction';
  category: Category;
  tx: Transaction;
  baseline: number;
};
type Anomaly = AnomalyCategory | AnomalyTransaction;

export default function InsightsScreen() {
  const { t, i18n } = useTranslation(['insights', 'common']);
  const router = useRouter();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const accent = tokens.accent.insights;

  const [trend, setTrend] = useState<{ yearMonth: string; total: number }[]>([]);
  const [thisMonthTxs, setThisMonthTxs] = useState<Transaction[]>([]);
  const [thisMonthTotals, setThisMonthTotals] = useState<CategoryMonthTotal[]>([]);
  const [trendCmts, setTrendCmts] = useState<CategoryMonthTotal[][]>([]);
  const [allTxsByMonth, setAllTxsByMonth] = useState<Map<string, Transaction[]>>(new Map());
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Heatmap can navigate prev/next inside the trend window. Defaults to
  // the current month (index 0); decrementing the index goes forward in
  // time, incrementing goes back. Capped at 0..TREND_MONTHS-1.
  const [heatmapIdx, setHeatmapIdx] = useState(0);

  // Compute the 6 yearMonths backwards from current. Memoised so the
  // useEffect deps are stable.
  const yearMonths = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < TREND_MONTHS; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;   // [current, last, ..., oldest]
  }, []);

  useEffect(() => {
    if (!wid) return;
    let cancelled = false;
    (async () => {
      try {
        const cmtPromises = yearMonths.map((ym) => listMonthTotals(wid, ym));
        // Load transactions for all 6 months upfront so heatmap month
        // navigation is instant. Per-month txs are bounded (~50/month
        // typical) so 6 × 50 = 300 reads is a small bump over the
        // single-month variant. orderByDate: false dodges the
        // composite index requirement (Insights doesn't need date
        // order — it filters by day-of-month + category).
        const txsPromises = yearMonths.map((ym) =>
          listTransactions(wid, { yearMonth: ym, orderByDate: false }),
        );
        const [cmts, txsList, cats] = await Promise.all([
          Promise.all(cmtPromises),
          Promise.all(txsPromises),
          listCategories(wid),
        ]);
        if (cancelled) return;
        const trendData = yearMonths.map((ym, i) => ({
          yearMonth: ym,
          total: cmts[i]?.reduce((s, m) => s + m.totalIDR, 0) ?? 0,
        }));
        const txsByMonth = new Map<string, Transaction[]>();
        yearMonths.forEach((ym, i) => txsByMonth.set(ym, txsList[i] ?? []));
        setTrend(trendData);
        setTrendCmts(cmts);
        setThisMonthTotals(cmts[0] ?? []);
        setThisMonthTxs(txsList[0] ?? []);
        setAllTxsByMonth(txsByMonth);
        setCategories(cats);
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        console.warn('[insights] load failed', err);
        setLoadError(true);
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [wid, yearMonths]);

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  // ----- Anomaly detection -----
  const anomalies = useMemo<Anomaly[]>(() => {
    if (!loaded || trend.length < 4) return [];   // need 3 baseline months + current
    const out: Anomaly[] = [];

    // Category anomalies — current vs avg of last 3 months
    const baselineMonths = trendCmts.slice(1, 4); // last 3, excluding current
    const totalsByCategory = new Map<string, number[]>();   // catId → [totalIDR per past month]
    for (const monthCmts of baselineMonths) {
      for (const cmt of monthCmts) {
        const arr = totalsByCategory.get(cmt.categoryId) ?? [];
        arr.push(cmt.totalIDR);
        totalsByCategory.set(cmt.categoryId, arr);
      }
    }
    for (const cmt of thisMonthTotals) {
      const baselineArr = totalsByCategory.get(cmt.categoryId) ?? [];
      // Pad with zeros for months where this category had no spend
      while (baselineArr.length < 3) baselineArr.push(0);
      const baseline = baselineArr.reduce((s, v) => s + v, 0) / baselineArr.length;
      if (baseline === 0) continue;   // no historical data — can't say "more than usual"
      if (cmt.totalIDR < ANOMALY_MIN_AMOUNT) continue;
      if (cmt.totalIDR < baseline * ANOMALY_CATEGORY_RATIO) continue;
      const cat = categoriesById.get(cmt.categoryId);
      if (!cat) continue;
      out.push({ kind: 'category', category: cat, current: cmt.totalIDR, baseline });
    }
    // Sort by ratio desc, take top 3
    out.sort((a, b) => {
      const ra = a.kind === 'category' ? a.current / a.baseline : 0;
      const rb = b.kind === 'category' ? b.current / b.baseline : 0;
      return rb - ra;
    });
    const categoryOuts = out.slice(0, 3);

    // Single-transaction anomalies — current-month tx vs category's baseline-month-avg
    const txOuts: AnomalyTransaction[] = [];
    for (const tx of thisMonthTxs) {
      if (tx.type !== 'expense') continue;
      const split = tx.splits[0];
      if (!split) continue;
      const cat = categoriesById.get(split.categoryId);
      if (!cat) continue;
      const baselineArr = totalsByCategory.get(split.categoryId) ?? [];
      // Approximate "biasanya" via avg-amount-per-transaction in past months —
      // pull from category_month_totals (totalIDR / txCount). Per ADR-13 §5
      // option B (approximate, not true median).
      const baselineMonthsForCat = baselineMonths
        .map((cmts) => cmts.find((c) => c.categoryId === split.categoryId))
        .filter((c): c is CategoryMonthTotal => Boolean(c));
      if (baselineMonthsForCat.length === 0) continue;
      const totalSpend = baselineMonthsForCat.reduce((s, c) => s + c.totalIDR, 0);
      const totalCount = baselineMonthsForCat.reduce((s, c) => s + c.txCount, 0);
      if (totalCount === 0) continue;
      const baselineAvgPerTx = totalSpend / totalCount;
      if (baselineAvgPerTx === 0) continue;
      if (tx.amount < ANOMALY_MIN_AMOUNT) continue;
      if (tx.amount < baselineAvgPerTx * ANOMALY_TX_RATIO) continue;
      txOuts.push({ kind: 'transaction', category: cat, tx, baseline: baselineAvgPerTx });
      // suppress unused
      void baselineArr;
    }
    txOuts.sort((a, b) => b.tx.amount - a.tx.amount);

    return [...categoryOuts, ...txOuts.slice(0, 3)].slice(0, ANOMALY_MAX_CALLOUTS);
  }, [loaded, trend.length, trendCmts, thisMonthTotals, thisMonthTxs, categoriesById]);

  // ----- Heatmap data — driven by heatmapIdx (0 = current, higher = older) -----
  const heatmap = useMemo(() => {
    if (!loaded) return null;
    const heatmapYM = yearMonths[heatmapIdx] ?? yearMonths[0]!;
    const [yStr, mStr] = heatmapYM.split('-');
    const year = Number(yStr);
    const month = Number(mStr) - 1;   // 0-indexed
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDow = new Date(year, month, 1).getDay();   // 0=Sun
    const dayTotals = new Array<number>(daysInMonth + 1).fill(0);   // 1-indexed
    const txs = allTxsByMonth.get(heatmapYM) ?? [];
    for (const tx of txs) {
      if (tx.type !== 'expense') continue;
      const day = Number(tx.date.slice(8, 10));
      if (day >= 1 && day <= daysInMonth) {
        dayTotals[day] = (dayTotals[day] ?? 0) + tx.amount;
      }
    }
    const max = dayTotals.reduce((m, v) => Math.max(m, v), 0);
    const heaviestDay = dayTotals.indexOf(max);
    return { yearMonth: heatmapYM, year, month, dayTotals, daysInMonth, firstDow, max, heaviestDay };
  }, [loaded, yearMonths, heatmapIdx, allTxsByMonth]);

  // ----- Day-of-week aggregation -----
  // Average per dow across all transactions in the trend window.
  const dayOfWeek = useMemo(() => {
    if (!loaded || trend.length < 1) return null;
    // For day-of-week we use just current-month transactions for v1 — a richer
    // multi-month aggregation would need the full transaction list across the
    // trend window which inflates the read count. Current month is enough for
    // the pattern signal at this scale.
    const sumByDow = new Array<number>(7).fill(0);
    const countByDow = new Array<number>(7).fill(0);
    for (const tx of thisMonthTxs) {
      if (tx.type !== 'expense') continue;
      const d = new Date(`${tx.date}T00:00:00`);
      const dow = d.getDay();
      sumByDow[dow] = (sumByDow[dow] ?? 0) + tx.amount;
      countByDow[dow] = (countByDow[dow] ?? 0) + 1;
    }
    const avgByDow = sumByDow.map((s, i) => {
      const c = countByDow[i] ?? 0;
      return c > 0 ? s / c : 0;
    });
    const max = avgByDow.reduce((m, v) => Math.max(m, v), 0);
    if (max === 0) return null;

    // Compute weekend-vs-weekday insight line. Sat=6, Sun=0; weekday=1-5.
    const sun = avgByDow[0] ?? 0;
    const sat = avgByDow[6] ?? 0;
    const sunCount = countByDow[0] ?? 0;
    const satCount = countByDow[6] ?? 0;
    const weekendSum = sun + sat;
    const weekendDays = (sunCount > 0 ? 1 : 0) + (satCount > 0 ? 1 : 0);
    const weekdayAvgs = [1, 2, 3, 4, 5].map((i) => avgByDow[i] ?? 0);
    const weekdayCounts = [1, 2, 3, 4, 5].map((i) => countByDow[i] ?? 0);
    const weekdaySum = weekdayAvgs.reduce((s, v) => s + v, 0);
    const weekdayDays = weekdayCounts.filter((c) => c > 0).length;
    const weekendAvg = weekendDays > 0 ? weekendSum / weekendDays : 0;
    const weekdayAvg = weekdayDays > 0 ? weekdaySum / weekdayDays : 0;
    let insight: { kind: 'weekend' | 'weekday'; ratio: string } | null = null;
    if (weekendAvg > 0 && weekdayAvg > 0) {
      const ratio = Math.max(weekendAvg, weekdayAvg) / Math.min(weekendAvg, weekdayAvg);
      if (ratio >= 1.5) {
        insight = {
          kind: weekendAvg > weekdayAvg ? 'weekend' : 'weekday',
          ratio: `${ratio.toFixed(1)}×`,
        };
      }
    }
    return { avgByDow, max, insight };
  }, [loaded, trend.length, thisMonthTxs]);

  // ----- Render -----

  const sectionLabelClass = 'font-sans-medium text-xs uppercase tracking-wider mb-3';

  // Empty-state — fresh user, no transactions, no months with data.
  const totallyEmpty =
    loaded && trend.every((m) => m.total === 0) && thisMonthTxs.length === 0;

  if (loadError) {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40, paddingBottom: 100 }}>
        <View className="self-center w-full max-w-md lg:max-w-3xl">
          <Card padding="lg">
            <Text className="font-sans text-sm" style={{ color: mutedColor }}>
              {t('insights:loadingFailed')}
            </Text>
          </Card>
        </View>
      </ScrollView>
    );
  }

  if (totallyEmpty) {
    // Preview list — 4 mini-rows with icon + title + body, mirroring the
    // four sections that will appear once data exists. Gives the user a
    // concrete preview rather than a single bare "no insights" card.
    const previewIcons = [TrendingUp, Sparkles, CalendarDays, Zap] as const;
    const previewKeys = ['trend', 'anomaly', 'heatmap', 'weekday'] as const;
    return (
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40, paddingBottom: 100 }}>
        <View className="self-center w-full max-w-md lg:max-w-3xl">
          {/* Welcome block */}
          <View className="items-center mt-4 mb-8">
            <View
              style={{
                width: 64, height: 64, borderRadius: 16,
                backgroundColor: accent + '22',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Sparkles size={32} color={accent} strokeWidth={2.2} />
            </View>
            <Text
              className="font-sans-bold text-2xl text-center"
              style={{ color: fgColor }}
            >
              {t('insights:empty.title')}
            </Text>
            <Text
              className="font-sans text-sm text-center mt-3"
              style={{ color: mutedColor, lineHeight: 20, maxWidth: 320 }}
            >
              {t('insights:empty.body')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('insights:empty.cta')}
              onPress={() =>
                router.replace({ pathname: '/transaction/new', params: { from: '/insights' } } as Href)
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 18,
                paddingVertical: 12,
                marginTop: 20,
                borderRadius: 10,
                backgroundColor: accent,
                minHeight: 44,
              }}
            >
              <Plus size={14} color="#fff" />
              <Text className="font-sans-medium text-white text-sm">
                {t('insights:empty.cta')}
              </Text>
            </Pressable>
          </View>

          {/* Preview list — four mini-rows, one per section the user
              will see once they've logged some transactions. */}
          <Text
            className="font-sans-medium text-xs uppercase tracking-wider mb-3"
            style={{ color: mutedColor }}
          >
            {t('insights:empty.previewTitle')}
          </Text>
          <Card padding="none">
            {previewKeys.map((key, idx) => {
              // Icons array is parallel to keys; non-null asserted because
              // both are length-4 const tuples typed by index.
              const Icon = previewIcons[idx]!;
              return (
                <View
                  key={key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: borderColor,
                  }}
                >
                  <View
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: accent + '14',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon size={18} color={accent} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className="font-sans-semibold text-sm" style={{ color: fgColor }}>
                      {t(`insights:empty.preview.${key}Title`)}
                    </Text>
                    <Text
                      className="font-sans text-xs mt-1"
                      style={{ color: mutedColor, lineHeight: 18 }}
                    >
                      {t(`insights:empty.preview.${key}Body`)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
      <View className="self-center w-full max-w-md lg:max-w-3xl">
        {/* ===== TREND ===== */}
        {loaded ? (
          <View className="mb-8">
            <Text className={sectionLabelClass} style={{ color: mutedColor }}>
              {t('insights:sections.trend')}
            </Text>
            {trend.every((m) => m.total === 0) ? (
              <Text className="font-sans text-sm" style={{ color: mutedColor }}>
                {t('insights:trend.noData')}
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {[...trend].reverse().map((m, idx) => {
                  // [...].reverse() so oldest renders first (left-to-right
                  // chronological reading order for the bar stack).
                  const isCurrent = idx === trend.length - 1;
                  const max = trend.reduce((mx, x) => Math.max(mx, x.total), 0);
                  const pct = max === 0 ? 0 : m.total / max;
                  const monthDate = new Date(`${m.yearMonth}-01T00:00:00`);
                  const monthLabel = formatDate(monthDate, 'long-month', lang);
                  return (
                    <View key={m.yearMonth}>
                      <View className="flex-row items-baseline justify-between mb-1.5">
                        <Text
                          className="font-sans-medium text-xs"
                          style={{
                            color: isCurrent ? accent : mutedColor,
                          }}
                        >
                          {monthLabel}
                        </Text>
                        <Text
                          className="font-mono tabular-nums text-xs"
                          style={{
                            color: isCurrent ? fgColor : mutedColor,
                          }}
                        >
                          {formatIDR(m.total, lang)}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: borderColor,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            width: `${Math.max(pct * 100, 2)}%`,
                            height: 8,
                            backgroundColor: isCurrent ? accent : accent + '55',
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {/* ===== ANOMALIES ===== */}
        {loaded && anomalies.length > 0 ? (
          <View className="mb-8">
            <Text className={sectionLabelClass} style={{ color: mutedColor }}>
              {t('insights:sections.anomalies')}
            </Text>
            <View style={{ gap: 8 }}>
              {anomalies.map((a, i) => (
                <AnomalyCard
                  key={`${a.kind}-${i}`}
                  anomaly={a}
                  isDark={isDark}
                  lang={lang}
                  fgColor={fgColor}
                  mutedColor={mutedColor}
                  borderColor={borderColor}
                  t={t}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* ===== HEATMAP ===== */}
        {loaded && heatmap ? (
          <View className="mb-8">
            <Text className={sectionLabelClass} style={{ color: mutedColor }}>
              {t('insights:sections.heatmap')}
            </Text>
            {/* Month navigation: chevrons left/right with the active
                month label centered. Prev disabled at the oldest month
                in the trend window; Next disabled at the current month
                (no future to navigate to). */}
            <View
              className="flex-row items-center justify-between mb-3"
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                paddingHorizontal: 4,
                paddingVertical: 4,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.back')}
                accessibilityState={{ disabled: heatmapIdx >= TREND_MONTHS - 1 }}
                disabled={heatmapIdx >= TREND_MONTHS - 1}
                onPress={() => setHeatmapIdx((i) => Math.min(i + 1, TREND_MONTHS - 1))}
                hitSlop={8}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: heatmapIdx >= TREND_MONTHS - 1 ? 0.3 : 1,
                }}
              >
                <ChevronLeft size={18} color={fgColor} />
              </Pressable>
              <Text
                className="font-sans-medium text-sm"
                style={{ color: fgColor }}
              >
                {formatDate(new Date(heatmap.year, heatmap.month, 1), 'long-month', lang)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next"
                accessibilityState={{ disabled: heatmapIdx <= 0 }}
                disabled={heatmapIdx <= 0}
                onPress={() => setHeatmapIdx((i) => Math.max(i - 1, 0))}
                hitSlop={8}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: heatmapIdx <= 0 ? 0.3 : 1,
                }}
              >
                <ChevronRight size={18} color={fgColor} />
              </Pressable>
            </View>

            {heatmap.max === 0 ? (
              <Text className="font-sans text-sm" style={{ color: mutedColor }}>
                {t('insights:heatmap.noData')}
              </Text>
            ) : (
              <>
                {/* Cap container width on desktop so cells don't blow up
                    to ~110×110 px. 420 px = 7 cells × ~52 px each + gap,
                    centered. Mobile already constrained by the page
                    column max-width. */}
                <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
                  <Heatmap
                    daysInMonth={heatmap.daysInMonth}
                    firstDow={heatmap.firstDow}
                    dayTotals={heatmap.dayTotals}
                    max={heatmap.max}
                    accent={accent}
                    borderColor={borderColor}
                    mutedColor={mutedColor}
                    fgColor={fgColor}
                    weekdayShortNames={
                      (t('insights:weekday.shortNames', { returnObjects: true }) as string[]) ?? []
                    }
                  />
                </View>
                {heatmap.heaviestDay > 0 ? (
                  <Text className="font-sans text-xs mt-3 text-center" style={{ color: mutedColor }}>
                    {t('insights:heatmap.tipMost', {
                      day: heatmap.heaviestDay,
                      amount: formatIDR(heatmap.max, lang),
                    })}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {/* ===== DAY-OF-WEEK ===== */}
        {loaded && dayOfWeek ? (
          <View className="mb-2">
            <Text className={sectionLabelClass} style={{ color: mutedColor }}>
              {t('insights:sections.weekday')}
            </Text>
            <View style={{ gap: 8 }}>
              {dayOfWeek.avgByDow.map((avg, dow) => {
                const pct = dayOfWeek.max === 0 ? 0 : avg / dayOfWeek.max;
                const dayName =
                  (t('insights:weekday.shortNames', { returnObjects: true }) as string[])?.[dow] ??
                  '';
                return (
                  <View key={dow} className="flex-row items-center" style={{ gap: 12 }}>
                    <Text
                      className="font-sans-medium text-xs"
                      style={{ color: mutedColor, width: 36 }}
                    >
                      {dayName}
                    </Text>
                    <View
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: borderColor,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.max(pct * 100, avg > 0 ? 4 : 0)}%`,
                          height: 6,
                          backgroundColor: accent + 'cc',
                        }}
                      />
                    </View>
                    <Text
                      className="font-mono tabular-nums text-xs"
                      style={{ color: mutedColor, width: 80, textAlign: 'right' }}
                    >
                      {avg > 0 ? formatIDR(avg, lang) : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
            {dayOfWeek.insight ? (
              <Text className="font-sans text-xs mt-3" style={{ color: mutedColor }}>
                {dayOfWeek.insight.kind === 'weekend'
                  ? t('insights:weekday.weekendHeavier', { ratio: dayOfWeek.insight.ratio })
                  : t('insights:weekday.weekdayHeavier', { ratio: dayOfWeek.insight.ratio })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

// ---------- AnomalyCard ----------

type AnomalyCardProps = {
  anomaly: Anomaly;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  t: TFunction;
};

function AnomalyCard({ anomaly, isDark, lang, fgColor, mutedColor, borderColor, t }: AnomalyCardProps) {
  const cat = anomaly.category;
  const catColor = resolveCategoryColor(cat.color, isDark ? 'dark' : 'light');
  const title =
    anomaly.kind === 'category'
      ? t('insights:anomaly.categoryHigherTitle', { categoryName: cat.name[lang] })
      : t('insights:anomaly.singleTransactionTitle', { categoryName: cat.name[lang] });
  const body =
    anomaly.kind === 'category'
      ? t('insights:anomaly.categoryHigher', {
          categoryName: cat.name[lang],
          amount: formatIDR(anomaly.current, lang),
          baseline: formatIDR(anomaly.baseline, lang),
        })
      : t('insights:anomaly.singleTransaction', {
          categoryName: cat.name[lang],
          amount: formatIDR(anomaly.tx.amount, lang),
        });

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor,
        borderRadius: 12,
        padding: 14,
        flexDirection: 'row',
        gap: 12,
      }}
    >
      <View
        style={{
          width: 40, height: 40, borderRadius: 10,
          backgroundColor: catColor + '22',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <TrendingUp size={18} color={catColor} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <View className="flex-row items-center" style={{ gap: 6, marginBottom: 4 }}>
          <CategoryIcon name={cat.icon} color={catColor} size={14} />
          <Text className="font-sans-semibold text-sm" style={{ color: fgColor }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text className="font-sans text-xs" style={{ color: mutedColor, lineHeight: 18 }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

// ---------- Heatmap ----------

type HeatmapProps = {
  daysInMonth: number;
  firstDow: number;
  dayTotals: number[];
  max: number;
  accent: string;
  borderColor: string;
  mutedColor: string;
  fgColor: string;
  weekdayShortNames: string[];
};

/**
 * Calendar heatmap. 7-column grid of cells, each ~40×40 on mobile.
 * Cell color intensity = `(dayTotal / max)`. Day with no spend stays at the
 * muted base. Day numbers render inside cells.
 */
function Heatmap({
  daysInMonth, firstDow, dayTotals, max,
  accent, borderColor, mutedColor, fgColor, weekdayShortNames,
}: HeatmapProps) {
  // Pad cells before day 1 so the first day lines up with the right weekday
  // column. `firstDow` is 0=Sun..6=Sat; our column order matches.
  const cells: ({ day: number; total: number } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, total: dayTotals[d] ?? 0 });

  return (
    <View>
      {/* Weekday header */}
      <View className="flex-row" style={{ gap: 4, marginBottom: 4 }}>
        {weekdayShortNames.map((n, i) => (
          <Text
            key={i}
            className="font-sans-medium text-[10px]"
            style={{ color: mutedColor, flex: 1, textAlign: 'center' }}
          >
            {n}
          </Text>
        ))}
      </View>
      {/* Day cells in rows of 7 */}
      <View style={{ gap: 4 }}>
        {chunk(cells, 7).map((row, rowIdx) => (
          <View key={rowIdx} className="flex-row" style={{ gap: 4 }}>
            {row.map((cell, i) => {
              if (!cell) return <View key={i} style={{ flex: 1, aspectRatio: 1 }} />;
              const intensity = max === 0 ? 0 : cell.total / max;
              // Map intensity 0..1 to opacity 0..1 atop the muted base.
              const fillAlpha = intensity === 0 ? 0 : Math.max(0.15, intensity);
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor,
                    backgroundColor:
                      intensity === 0 ? 'transparent' : accent + alphaHex(fillAlpha),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    className="font-sans text-[10px]"
                    style={{
                      color: intensity > 0.5 ? '#fff' : intensity > 0 ? fgColor : mutedColor,
                    }}
                  >
                    {cell.day}
                  </Text>
                </View>
              );
            })}
            {/* Pad short final row to keep cells the same width */}
            {row.length < 7
              ? Array.from({ length: 7 - row.length }).map((_, i) => (
                  <View key={`pad-${i}`} style={{ flex: 1, aspectRatio: 1 }} />
                ))
              : null}
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------- helpers ----------

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function alphaHex(alpha: number): string {
  const v = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return v.toString(16).padStart(2, '0');
}
