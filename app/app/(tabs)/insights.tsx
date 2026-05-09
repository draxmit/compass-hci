import type { Budget, Category, CategoryMonthTotal, Transaction } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Sparkles, TrendingUp, Zap,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
// expo-linear-gradient was used by an older AskCompassCta variant
// (banner card with diagonal gradient). The current "conversational
// composer" Ask Compass uses solid input bg, so the gradient import
// is no longer needed here. If you re-introduce a gradient surface
// on this page, re-import as `RNLinearGradient`.
import Svg, {
  Circle, Defs, LinearGradient, Path, Line as SvgLine, Polyline, Stop,
} from 'react-native-svg';

import { listBudgets } from '@/services/firestore/budgetsService';
import { listCategories } from '@/services/firestore/categoriesService';
import { listMonthTotals } from '@/services/firestore/categoryMonthTotalsService';
import { listTransactions } from '@/services/firestore/transactionsService';
import { useAuthUser } from '@/stores/authStore';
import { useBreakpoint } from '@/shared/hooks/useBreakpoint';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Skeleton, SkeletonCard } from '@/shared/ui/Skeleton';
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

/**
 * Cold-load silhouette for the Insights tab. Mirrors the real layout
 * (Ask CTA pill → Spending trend → What's notable → Heatmap) so the
 * page has visible structure during the ~50–500 ms before Firestore's
 * first emission lands. Each block is a Skeleton bar that pulses
 * between 0.4 and 0.8 opacity so it reads as "loading", not broken.
 */
function InsightsSkeleton() {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
      <View className="self-center w-full max-w-md lg:max-w-3xl">
        {/* Ask CTA pill silhouette */}
        <View style={{ marginBottom: 36 }}>
          <Skeleton height={48} radius={999} />
        </View>
        {/* Spending trend section: header + chart area + month labels */}
        <View className="mb-8">
          <Skeleton width={140} height={10} radius={4} style={{ marginBottom: 14 }} />
          <Skeleton width={'40%'} height={14} radius={6} style={{ marginBottom: 6 }} />
          <Skeleton width={'30%'} height={20} radius={6} style={{ marginBottom: 16 }} />
          <Skeleton height={110} radius={12} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <Skeleton width={'60%'} height={9} radius={4} />
                <Skeleton width={'45%'} height={11} radius={4} />
              </View>
            ))}
          </View>
        </View>
        {/* What's notable list — 3 anomaly card silhouettes */}
        <View className="mb-8">
          <Skeleton width={180} height={10} radius={4} style={{ marginBottom: 14 }} />
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} height={84} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Skeleton width={48} height={48} radius={10} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton width={'55%'} height={13} radius={4} />
                  <Skeleton width={'85%'} height={11} radius={4} />
                  <Skeleton width={'70%'} height={11} radius={4} />
                </View>
              </View>
            </SkeletonCard>
          ))}
        </View>
        {/* Budget Health silhouette */}
        <View className="mb-8">
          <Skeleton width={140} height={10} radius={4} style={{ marginBottom: 14 }} />
          <SkeletonCard height={120}>
            <Skeleton width={'100%'} height={8} radius={4} style={{ marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flex: 1, gap: 6 }}>
                  <Skeleton width={'60%'} height={11} radius={4} />
                  <Skeleton width={'40%'} height={18} radius={4} />
                </View>
              ))}
            </View>
          </SkeletonCard>
        </View>
        {/* Calendar heatmap silhouette */}
        <View className="mb-8">
          <Skeleton width={160} height={10} radius={4} style={{ marginBottom: 14 }} />
          <SkeletonCard height={180}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton
                  key={i}
                  width={'13%'}
                  height={20}
                  radius={4}
                />
              ))}
            </View>
          </SkeletonCard>
        </View>
      </View>
    </ScrollView>
  );
}

export default function InsightsScreen() {
  const { t, i18n } = useTranslation(['insights', 'common', 'ask']);
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
  // Budget Health pill (v3-polish): cross-references this-month
  // budgets with this-month spend to render a 3-bucket summary
  // (on-track / at-risk / over). Loaded alongside the rest.
  const [thisMonthBudgets, setThisMonthBudgets] = useState<Budget[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Heatmap can navigate prev/next inside the trend window. Defaults to
  // the current month (index 0); decrementing the index goes forward in
  // time, incrementing goes back. Capped at 0..TREND_MONTHS-1.
  const [heatmapIdx, setHeatmapIdx] = useState(0);
  // v3 phase A — 6: heatmap view toggle. 'month' is the existing
  // calendar grid; 'year' is the GitHub-style year-at-a-glance with
  // 12 month columns × 31 day rows. Year view triggers a separate
  // fetch since the trend window is only 6 months.
  const [heatmapView, setHeatmapView] = useState<'month' | 'year'>('month');
  // Year view data: ONE total per month, NOT daily transactions.
  // We fetch 12 monthly summary docs (tiny — sum-of-spending per
  // category per month). `null` = not yet fetched.
  const [yearMonthTotals, setYearMonthTotals] = useState<Map<string, number> | null>(null);
  const [yearTotalsLoading, setYearTotalsLoading] = useState(false);

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
        const [cmts, txsList, cats, budgets] = await Promise.all([
          Promise.all(cmtPromises),
          Promise.all(txsPromises),
          listCategories(wid),
          // This-month budgets — needed for the Budget Health pill.
          // Single read; cheap (<10 docs typical).
          listBudgets(wid, yearMonths[0]!),
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
        setThisMonthBudgets(budgets);
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
    }
    txOuts.sort((a, b) => b.tx.amount - a.tx.amount);
    const txOutsCapped = txOuts.slice(0, 3);

    // Dedupe: when a category-anomaly is mostly explained by a single-tx
    // anomaly in the SAME category, drop the category callout. The
    // single-tx callout is more specific and informative — surfacing
    // both for the same root cause reads as redundant noise to the user.
    // "Mostly explained" = the single tx accounts for ≥ 70% of the
    // category's overage above baseline.
    //
    // Type-narrow `categoryOuts` to AnomalyCategory[] — by construction
    // it only contains category anomalies (we only push that kind into
    // `out` at this point), but TS can't infer that from the loose
    // Anomaly[] type.
    const categoryOnly = categoryOuts.filter(
      (a): a is AnomalyCategory => a.kind === 'category',
    );
    const txCatIds = new Set(txOutsCapped.map((t) => t.category.id));
    const dedupedCategoryOuts = categoryOnly.filter((c) => {
      if (!txCatIds.has(c.category.id)) return true;
      const overage = c.current - c.baseline;
      const biggestTx = txOutsCapped.find((t) => t.category.id === c.category.id);
      if (!biggestTx) return true;
      return biggestTx.tx.amount < overage * 0.7;
    });

    return [...dedupedCategoryOuts, ...txOutsCapped].slice(0, ANOMALY_MAX_CALLOUTS);
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

  // ----- Year heatmap data (v3 phase A — 6) -----
  // Rolling 12-month window ending in the current month. Fetched lazily
  // when the user toggles to year view to avoid burning Firestore reads
  // on the typical month-view session.
  const yearMonthsList = useMemo(() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;   // oldest → newest
  }, []);

  // Year view: fetch ONE total per month. CategoryMonthTotal docs are
  // tiny (~10 per month, summary-only — no per-day breakdown). 12
  // parallel fetches of 10 small docs each = ~5kb total. Should
  // resolve in <1s on any reasonable connection.
  //
  // Hot start: the trend-chart fetch (in the main mount effect above)
  // already loaded month-totals for the 6 trend months as `trendCmts`.
  // Pre-fill those into the year totals map so they render instantly;
  // only the OLDER 6 months hit the network.
  useEffect(() => {
    if (heatmapView !== 'year') return;
    if (yearMonthTotals || yearTotalsLoading) return;
    if (!wid) return;
    setYearTotalsLoading(true);
    let cancelled = false;

    const seed = new Map<string, number>();
    const cacheHitMonths = new Set<string>();
    yearMonths.forEach((ym, i) => {
      const monthCmts = trendCmts[i];
      if (monthCmts) {
        const total = monthCmts.reduce((s, m) => s + m.totalIDR, 0);
        seed.set(ym, total);
        cacheHitMonths.add(ym);
      }
    });
    setYearMonthTotals(seed);

    const monthsToFetch = yearMonthsList.filter(
      (ym) => !cacheHitMonths.has(ym),
    );
    if (monthsToFetch.length === 0) {
      setYearTotalsLoading(false);
      return;
    }

    let resolvedCount = 0;
    monthsToFetch.forEach((ym) => {
      const start = Date.now();
      void listMonthTotals(wid, ym)
        .then((cmts) => {
          if (cancelled) return;
          const total = cmts.reduce((s, m) => s + m.totalIDR, 0);
          console.log(
            `[insights] year totals ${ym}: ${cmts.length} cats / ${total} IDR in ${Date.now() - start}ms`,
          );
          setYearMonthTotals((prev) => {
            const next = new Map(prev ?? []);
            next.set(ym, total);
            return next;
          });
        })
        .catch((err: unknown) => {
          console.warn(`[insights] year totals ${ym} failed`, err);
          // Mark as 0 so the box renders empty rather than stuck.
          if (!cancelled) {
            setYearMonthTotals((prev) => {
              const next = new Map(prev ?? []);
              next.set(ym, 0);
              return next;
            });
          }
        })
        .finally(() => {
          if (cancelled) return;
          resolvedCount++;
          if (resolvedCount === monthsToFetch.length) {
            setYearTotalsLoading(false);
          }
        });
    });

    return () => { cancelled = true; };
  }, [heatmapView, yearMonthTotals, yearTotalsLoading, wid, yearMonths, yearMonthsList, trendCmts]);

  // Per-month heatmap data for the stacked-grid year view. Each entry
  // is a single month's daily totals + how to lay it out (firstDow,
  // daysInMonth). The `max` is shared across all months so cell color
  // intensity is comparable month-to-month — without it, a quiet month
  // would look just as "hot" as a heavy one.
  // 12-box year overview. ONE box per month, intensity = total
  // spending / max(across-12-months). No daily breakdown — way faster
  // to compute, way faster to render, way easier to scan.
  const yearMonthBoxes = useMemo(() => {
    if (heatmapView !== 'year' || !yearMonthTotals) return null;
    let max = 0;
    const boxes = yearMonthsList.map((ym) => {
      const total = yearMonthTotals.get(ym);
      if (total !== undefined && total > max) max = total;
      return {
        yearMonth: ym,
        total: total ?? null,         // null = still loading this month
        loaded: total !== undefined,  // resolved (even if 0)
      };
    });
    return { boxes, max };
  }, [heatmapView, yearMonthTotals, yearMonthsList]);

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

  // Full-page skeleton during cold load — gives the page a complete
  // structural silhouette (Ask CTA pill + trend chart + anomaly cards
  // + budget pill + heatmap) before Firestore's first emission lands,
  // so the user never sees a blank screen during the ~50–500 ms gap.
  if (!loaded) {
    return <InsightsSkeleton />;
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
        {/* ===== ASK COMPASS ENTRY (v3 phase B, ADR-23) ===== */}
        <View style={{ marginBottom: 36 }}>
          <AskCompassCta
            isDark={isDark}
            fgColor={fgColor}
            mutedColor={mutedColor}
            t={t}
            onPress={() => router.push('/ask')}
          />
        </View>

        {/* ===== TREND =====
            Trend / Anomalies first — they're the strongest "this is
            your spending behavior" signals and earn the second-screen
            position. BUDGET HEALTH (which is really a budgets-tab
            summary) moved further down per design critique. */}
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
              <TrendLineChart
                trend={trend}
                accent={accent}
                fgColor={fgColor}
                mutedColor={mutedColor}
                borderColor={borderColor}
                lang={lang}
              />
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

        {/* ===== BUDGET HEALTH (v3 polish) =====
            Lives between Anomalies and Heatmap — it's a summary of
            the Budgets tab, not a behavior insight, so it doesn't
            earn the top-of-page position. Hidden when no budgets. */}
        {loaded && thisMonthBudgets.length > 0 ? (
          <BudgetHealthSummary
            budgets={thisMonthBudgets}
            thisMonthTotals={thisMonthTotals}
            isDark={isDark}
            fgColor={fgColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            sectionLabelClass={sectionLabelClass}
            t={t}
            onPress={() => router.push('/budgets' as Href)}
          />
        ) : null}

        {/* ===== HEATMAP ===== */}
        {loaded && heatmap ? (
          <View className="mb-8">
            <Text className={sectionLabelClass} style={{ color: mutedColor }}>
              {t('insights:sections.heatmap')}
            </Text>
            {/* View toggle: Month / Year. Year fires a lazy fetch (12
                months) on first switch; subsequent toggles are free. */}
            <View
              className="flex-row mb-3"
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                padding: 4,
                gap: 4,
              }}
            >
              {(['month', 'year'] as const).map((mode) => {
                const active = heatmapView === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setHeatmapView(mode)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: active ? accent + '22' : 'transparent',
                    }}
                  >
                    <Text
                      className="font-sans-medium text-xs"
                      style={{ color: active ? accent : mutedColor }}
                    >
                      {t(mode === 'month' ? 'insights:heatmap.viewMonth' : 'insights:heatmap.viewYear')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {/* Month-view nav: chevrons left/right with the active month
                label. Hidden in year mode where there's nothing to navigate. */}
            {heatmapView === 'month' ? (
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
            ) : null}

            {heatmapView === 'month' ? (
              heatmap.max === 0 ? (
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
              )
            ) : (
              // Year view — 12 boxes, ONE per month. Each box's color
              // intensity scales with total spending vs the year max.
              // Tiny payload (12 small summary fetches), instant render
              // for any month already in the trend cache.
              !yearMonthBoxes ? null : (
                <YearMonthBoxes
                  boxes={yearMonthBoxes.boxes}
                  max={yearMonthBoxes.max}
                  accent={accent}
                  borderColor={borderColor}
                  mutedColor={mutedColor}
                  fgColor={fgColor}
                  lang={lang}
                />
              )
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

/**
 * Top-of-Insights entry point to the Gemini chat assistant
 * (ADR-23). Visually distinctive emerald-tinted card with an angled
 * gradient background so it doesn't read as just-another-section
 * header — it's the single most novel surface in the app and
 * warrants the eye-catch. Goes ABOVE the 6-month trend so users see
 * it before scrolling into analytics.
 */
function AskCompassCta({
  isDark,
  fgColor,
  mutedColor,
  t,
  onPress,
}: {
  isDark: boolean;
  fgColor: string;
  mutedColor: string;
  t: TFunction;
  onPress: () => void;
}) {
  // Conversational composer — DOESN'T look like a button. Looks
  // like the input the user is about to type into, mimicking
  // ChatGPT mobile's home screen / Cursor's chat trigger. Same
  // target as before (router.push('/ask')) but reads as the
  // beginning of a conversation, not a CTA.
  //
  // Mobile-vs-web sizing: previous version used desktop dimensions
  // verbatim on mobile and the user repeatedly flagged it as ugly +
  // "too thick". `useBreakpoint()` lets the mobile variant collapse
  // to a slimmer pill (smaller send circle, tighter padding, smaller
  // glyphs) while web keeps its more spacious feel. Result: the
  // mobile pill feels like a proper iOS/Android textfield instead
  // of a chunky CTA chip.
  const isMobile = useBreakpoint() === 'mobile';
  // Mobile gets a chunkier, more-confident pill — taller padding +
  // bigger send circle + shorter "Ask Compass" copy. Web stays in
  // the slimmer composer geometry it already had. Per user feedback
  // the previous slim pill on mobile read as a textfield rather than
  // a primary CTA; the fatter shape makes "this is the AI feature
  // button" unmistakable at a glance.
  const sendSize = isMobile ? 36 : 36;
  const padLeft = isMobile ? 18 : 18;
  const padRight = isMobile ? 8 : 8;
  const padVert = isMobile ? 12 : 8;
  const sparkleSize = isMobile ? 18 : 18;
  const arrowSize = isMobile ? 18 : 18;
  const gapPx = isMobile ? 12 : 10;
  // Short brand label on mobile — "Ask Compass" / "Tanya Compass"
  // (the existing `entryCta` key). Web still shows the longer
  // descriptor copy to fill the wider pill.
  const labelKey = isMobile ? 'ask:entryCta' : 'ask:composerPlaceholder';
  // Solid-emerald fill + WHITE BOLD copy — per user feedback the
  // tinted-fill / muted-copy variant didn't read as a primary CTA
  // ("make it all green with white bold text so it is obvious it is
  // pressable button and feature"). Now the pill is a high-contrast
  // brand button that reads unambiguously as "tap me".
  void isDark;
  void mutedColor;
  // Suppress no-unused-vars; props kept on the type signature for
  // backward compat in case callers still pass them.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('ask:entryCta')}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 999,
        opacity: pressed ? 0.88 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View
        style={{
          borderRadius: 999,
          backgroundColor: tokens.accent.dashboard,
          flexDirection: 'row',
          alignItems: 'center',
          gap: gapPx,
          paddingVertical: padVert,
          paddingLeft: padLeft,
          paddingRight: padRight,
          shadowColor: tokens.accent.dashboard,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        {/* Sparkles glyph hints "this is the AI surface". White on
            emerald for high-contrast visibility. */}
        <Sparkles size={sparkleSize} color="#ffffff" strokeWidth={2.4} />
        {/* CTA copy — bold white text on the emerald pill, reads as a
            primary button. Mobile uses the short brand label ("Ask
            Compass"); web fills the wider pill with the longer
            descriptor. */}
        <Text
          className={isMobile ? 'font-sans-bold text-base' : 'font-sans-bold text-sm'}
          style={{ color: '#ffffff', flex: 1 }}
          numberOfLines={1}
        >
          {t(labelKey)}
        </Text>
        {/* Send-arrow circle — INVERTED from the pill colour: white bg
            + emerald arrow. Pops against the green field and reads as
            the explicit submit/forward affordance. */}
        <View
          style={{
            width: sendSize,
            height: sendSize,
            borderRadius: sendSize / 2,
            backgroundColor: '#ffffff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronRight
            size={arrowSize}
            color={tokens.accent.dashboard}
            strokeWidth={2.6}
          />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Budget Health summary pill — at-a-glance view of how the user's
 * monthly budgets are tracking. Three buckets:
 *
 *   - On track  → spent < 80% of limit (positive green)
 *   - At risk   → spent 80–99% of limit (warning amber)
 *   - Over      → spent ≥ 100% of limit (danger red)
 *
 * Renders a compact card with a stacked-bar visualisation up top
 * (proportions of each bucket) + 3 numbered stat blocks underneath.
 * Tappable → routes to /budgets so users can drill into specifics.
 */
function BudgetHealthSummary({
  budgets,
  thisMonthTotals,
  isDark,
  fgColor,
  mutedColor,
  borderColor,
  sectionLabelClass,
  t,
  onPress,
}: {
  budgets: Budget[];
  thisMonthTotals: CategoryMonthTotal[];
  isDark: boolean;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  sectionLabelClass: string;
  t: TFunction;
  onPress: () => void;
}) {
  void isDark;
  const spentByCategory = new Map<string, number>();
  for (const m of thisMonthTotals) {
    spentByCategory.set(m.categoryId, m.totalIDR);
  }
  let onTrack = 0;
  let atRisk = 0;
  let over = 0;
  for (const b of budgets) {
    if (b.limitMinor <= 0) continue;
    const spent = spentByCategory.get(b.categoryId) ?? 0;
    const ratio = spent / b.limitMinor;
    if (ratio >= 1) over++;
    else if (ratio >= 0.8) atRisk++;
    else onTrack++;
  }
  const total = onTrack + atRisk + over;
  if (total === 0) return null;

  const onTrackPct = (onTrack / total) * 100;
  const atRiskPct = (atRisk / total) * 100;
  const overPct = (over / total) * 100;

  const positiveColor = tokens.semantic.positive;
  const warningColor = tokens.semantic.warning;
  const dangerColor = tokens.semantic.danger;

  return (
    <View className="mb-8">
      <Text className={sectionLabelClass} style={{ color: mutedColor }}>
        {t('insights:sections.budgetHealth')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('insights:budgetHealth.cardLabel', {
          total,
          onTrack,
          atRisk,
          over,
        })}
        onPress={onPress}
        style={{
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
        }}
      >
        {/* Stacked horizontal bar showing the proportions of each bucket. */}
        <View
          style={{
            flexDirection: 'row',
            height: 8,
            borderRadius: 4,
            overflow: 'hidden',
            backgroundColor: borderColor,
          }}
        >
          {onTrack > 0 ? (
            <View style={{ flexBasis: `${onTrackPct}%`, backgroundColor: positiveColor }} />
          ) : null}
          {atRisk > 0 ? (
            <View style={{ flexBasis: `${atRiskPct}%`, backgroundColor: warningColor }} />
          ) : null}
          {over > 0 ? (
            <View style={{ flexBasis: `${overPct}%`, backgroundColor: dangerColor }} />
          ) : null}
        </View>
        {/* Three counts below the bar. Mono font for column-aligned numerals. */}
        <View
          className="flex-row mt-3"
          style={{ gap: 12, alignItems: 'flex-start' }}
        >
          <BudgetHealthStat
            color={positiveColor}
            count={onTrack}
            label={t('insights:budgetHealth.onTrack')}
            fgColor={fgColor}
            mutedColor={mutedColor}
          />
          <BudgetHealthStat
            color={warningColor}
            count={atRisk}
            label={t('insights:budgetHealth.atRisk')}
            fgColor={fgColor}
            mutedColor={mutedColor}
          />
          <BudgetHealthStat
            color={dangerColor}
            count={over}
            label={t('insights:budgetHealth.over')}
            fgColor={fgColor}
            mutedColor={mutedColor}
          />
        </View>
      </Pressable>
    </View>
  );
}

function BudgetHealthStat({
  color,
  count,
  label,
  fgColor,
  mutedColor,
}: {
  color: string;
  count: number;
  label: string;
  fgColor: string;
  mutedColor: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
          }}
        />
        <Text
          className="font-mono tabular-nums text-base"
          style={{ color: fgColor, fontWeight: '600' }}
        >
          {count}
        </Text>
      </View>
      <Text
        className="font-sans text-xs mt-0.5"
        style={{ color: mutedColor }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

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

  // Neutral hairline border — matches every other section row in the
  // app. (Earlier amber-tinted variant was reverted per user feedback.)
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

// ---------- TrendLineChart ----------

type TrendLineChartProps = {
  trend: { yearMonth: string; total: number }[];
  accent: string;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  lang: Locale;
};

/**
 * 6-month spend trend rendered as an SVG polyline.
 *
 * Trend data arrives newest-first; we reverse for the chart so X
 * reads left→right oldest→newest, matching how time flows on a
 * standard line chart. The latest point gets a slightly larger dot
 * + the amount label rendered in fg colour to anchor the reader's
 * eye on "where are we now".
 *
 * Compact amount labels under each X-tick: '4,2jt' / '4.2M' style
 * — `formatIDR` would overflow a 6-column grid on mobile. The
 * inline compactor handles thousands ('rb' / 'k'), millions ('jt'
 * / 'M'), and billions ('M' / 'B').
 */
function TrendLineChart({
  trend, accent, fgColor, mutedColor, borderColor, lang,
}: TrendLineChartProps) {
  // Reverse to oldest-first so the line reads left-to-right.
  const ordered = [...trend].reverse();
  const max = Math.max(...ordered.map((m) => m.total), 1);

  // Tap-to-inspect: user taps a column to see that month's exact
  // amount in the hero line above the chart. Defaults to null so the
  // hero shows the LATEST month on first paint; tap once to inspect,
  // tap the same column again to deselect (returns to latest).
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const displayIdx = selectedIdx ?? ordered.length - 1;
  const displayPoint = ordered[displayIdx];

  // Measured chart width — set via onLayout. Earlier impl used a fixed
  // 320 viewBox + preserveAspectRatio='none' which stretched the SVG
  // horizontally and turned dots into ovals on wide screens (very
  // visible in desktop web). Now we measure the actual rendered width
  // and use it 1:1 as the viewBox so coordinates are pixel-correct
  // and circles render as actual circles regardless of screen size.
  const [chartW, setChartW] = useState(320);
  const W = chartW;
  const H = 110;
  const padTop = 12;
  const padBot = 18;
  const usableY = H - padTop - padBot;
  // Each dot sits at the CENTER of its corresponding column. The
  // labels below use `flex: 1` per column (so column 0 centre is at
  // W/12, column 1 at W/4, etc.), and the dots need to track the same
  // anchor — without this they drift to the chart's outer edges
  // while labels stay column-centred. Result: dot/label misalignment
  // visible on web at wide widths (Dec dot was ~70px left of the
  // "December" label at desktop width).
  const colWidth = ordered.length > 0 ? W / ordered.length : 0;

  const points = ordered.map((m, i) => {
    const x = colWidth / 2 + i * colWidth;
    const y = padTop + (1 - m.total / max) * usableY;
    return { x, y, total: m.total, yearMonth: m.yearMonth };
  });
  const polylineStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Stock-chart-style gradient area underneath the line — closes the
  // polyline at the baseline so the SVG fills the area between line
  // and X-axis with a vertical gradient (accent at top fading to
  // transparent at bottom). Adds depth without the busy noise of a
  // hard fill colour, matching the polished look of trading apps.
  const baselineY = H - padBot;
  const areaPath = points.length === 0
    ? ''
    : (() => {
        const first = points[0]!;
        const last = points[points.length - 1]!;
        const top = points
          .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(' ');
        return [
          `M ${first.x.toFixed(1)} ${baselineY.toFixed(1)}`,
          top.replace(/^L /, 'L '),
          `L ${last.x.toFixed(1)} ${baselineY.toFixed(1)}`,
          'Z',
        ].join(' ');
      })();
  const gradientId = 'trend-line-gradient';

  return (
    <View>
      {/* Hero line: selected month's full amount. Always shows
          something — defaults to the latest month, swaps to whatever
          the user tapped. */}
      {displayPoint ? (
        <View className="flex-row items-baseline justify-between mb-2">
          <Text
            className="font-sans-medium text-xs"
            style={{ color: selectedIdx !== null ? accent : mutedColor }}
            numberOfLines={1}
          >
            {formatDate(new Date(`${displayPoint.yearMonth}-01T00:00:00`), 'long-month', lang)}
          </Text>
          <Text
            className="font-mono tabular-nums text-base"
            style={{ color: fgColor }}
            numberOfLines={1}
          >
            {formatIDR(displayPoint.total, lang)}
          </Text>
        </View>
      ) : null}
      {/* SVG + tap-zone overlay. The SVG draws the line + dots; the
          row of Pressables on top divides the chart into N equal
          vertical strips so any tap inside a column selects that
          month. Cleaner than wiring onPress on tiny SVG circles
          (which are far smaller than a fingertip target). */}
      <View
        style={{ position: 'relative', height: H }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0 && w !== chartW) setChartW(w);
        }}
      >
        <Svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
        >
          <Defs>
            {/* Vertical gradient: accent ~28% opaque at the line down
                to fully transparent at the baseline. The 28% top stop
                is a sweet spot — readable enough to anchor the eye,
                soft enough to keep the polyline itself the hero. */}
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={accent} stopOpacity="0.28" />
              <Stop offset="60%" stopColor={accent} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={accent} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {/* Faint baseline. Stretches between the first and last
              dot's x-coords so it tracks them exactly even when
              column-centred dot positions sit inside W. */}
          <SvgLine
            x1={colWidth / 2} y1={baselineY}
            x2={W - colWidth / 2} y2={baselineY}
            stroke={borderColor} strokeWidth="1"
          />
          {/* Gradient area beneath the line — drawn BEFORE the line so
              it sits behind the stroke + dots. */}
          {areaPath ? (
            <Path d={areaPath} fill={`url(#${gradientId})`} />
          ) : null}
          {/* Soft glow under the main line — second polyline drawn
              with a thicker stroke + low opacity that blurs the edge.
              Subtle but adds the polished "depth" that distinguishes
              trading-app charts from plain wireframes. */}
          <Polyline
            points={polylineStr}
            fill="none"
            stroke={accent}
            strokeWidth="6"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.18}
          />
          {/* The line. */}
          <Polyline
            points={polylineStr}
            fill="none"
            stroke={accent}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Dots — selected dot biggest, latest mid-size, others small.
              Selected/latest get a halo ring (the "current price" treatment
              from trading-app charts) so the focal point reads at a glance.
              Other dots stay minimal so the polyline + gradient area carry
              most of the visual weight. */}
          {points.map((p, i) => {
            const isSelected = i === selectedIdx;
            const isLatest = i === points.length - 1;
            const isHero = isSelected || (selectedIdx === null && isLatest);
            if (isHero) {
              return (
                <React.Fragment key={p.yearMonth}>
                  <Circle cx={p.x} cy={p.y} r={11} fill={accent} opacity={0.12} />
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={8}
                    fill="none"
                    stroke={accent}
                    strokeWidth={1.2}
                    opacity={0.55}
                  />
                  <Circle cx={p.x} cy={p.y} r={isSelected ? 5 : 4} fill={accent} />
                </React.Fragment>
              );
            }
            return (
              <Circle
                key={p.yearMonth}
                cx={p.x}
                cy={p.y}
                r={2.5}
                fill={accent}
              />
            );
          })}
        </Svg>
        {/* Tap-zone overlay. Each column is a flex:1 Pressable that
            toggles selection for its index. Width matches the SVG
            container width via the relative parent; height is the
            full chart so users can tap anywhere in the column. */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: 'row',
          }}
          pointerEvents="box-none"
        >
          {ordered.map((m, i) => (
            <Pressable
              key={`tap-${m.yearMonth}`}
              accessibilityRole="button"
              accessibilityLabel={`${formatDate(new Date(`${m.yearMonth}-01T00:00:00`), 'long-month', lang)}: ${formatIDR(m.total, lang)}`}
              onPress={() =>
                setSelectedIdx((cur) => (cur === i ? null : i))
              }
              style={{ flex: 1, height: '100%' }}
            />
          ))}
        </View>
      </View>
      {/* Month labels under each X tick. */}
      <View className="flex-row" style={{ marginTop: 6 }}>
        {ordered.map((m, i) => {
          const monthDate = new Date(`${m.yearMonth}-01T00:00:00`);
          const monthShort = formatDate(monthDate, 'long-month', lang).split(' ')[0];
          const isSelected = i === selectedIdx;
          const isLatest = i === ordered.length - 1;
          return (
            <Text
              key={m.yearMonth}
              className="font-sans-medium"
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 10,
                color: isSelected || (selectedIdx === null && isLatest) ? accent : mutedColor,
              }}
              numberOfLines={1}
            >
              {monthShort}
            </Text>
          );
        })}
      </View>
      {/* Compact amount labels per column. */}
      <View className="flex-row" style={{ marginTop: 2 }}>
        {ordered.map((m, i) => {
          const isSelected = i === selectedIdx;
          const isLatest = i === ordered.length - 1;
          return (
            <Text
              key={m.yearMonth}
              className="font-mono tabular-nums"
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 10,
                color: isSelected || (selectedIdx === null && isLatest) ? fgColor : mutedColor,
              }}
              numberOfLines={1}
            >
              {compactIDR(m.total, lang)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Compact IDR formatter for chart axis labels — full `formatIDR` overflows
 * a 6-column grid on mobile. Buckets:
 *   - 0..999          → '0' / '423'
 *   - 1k..999k        → '12rb' / '12k'
 *   - 1jt..999jt      → '4,2jt' / '4.2M'
 *   - 1M+ (milyar/B)  → '1,3M' / '1.3B'
 */
function compactIDR(minor: number, lang: Locale): string {
  const idr = minor / 100;
  if (idr === 0) return '0';
  const sep = lang === 'id' ? ',' : '.';
  const fmt = (n: number, suffix: string) =>
    `${n.toFixed(1).replace('.', sep).replace(`${sep}0`, '')}${suffix}`;
  if (idr >= 1_000_000_000) return fmt(idr / 1_000_000_000, lang === 'id' ? 'M' : 'B');
  if (idr >= 1_000_000) return fmt(idr / 1_000_000, lang === 'id' ? 'jt' : 'M');
  if (idr >= 1_000) return fmt(idr / 1_000, lang === 'id' ? 'rb' : 'k');
  return Math.round(idr).toString();
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

// ---------- YearMonthBoxes ----------

type YearMonthBoxesProps = {
  boxes: { yearMonth: string; total: number | null; loaded: boolean }[];
  max: number;
  accent: string;
  borderColor: string;
  mutedColor: string;
  fgColor: string;
  lang: Locale;
};

/**
 * 12-month overview as a 4×3 grid of colored boxes. ONE box per month.
 * Cell intensity = total spending / year max. Inside each box: month
 * abbreviation (3-letter, locale-aware) on top + compact amount
 * below.
 *
 * Renders months still loading as muted skeleton boxes in the same
 * footprint, so the page doesn't shift as data arrives.
 *
 * 4-column layout works on every viewport: 4 cells fit in mobile-min
 * (~280px → ~64px each), and on desktop the constrained max-width
 * keeps boxes proportionate. No horizontal scroll needed.
 */
function YearMonthBoxes({
  boxes, max, accent, borderColor, mutedColor, fgColor, lang,
}: YearMonthBoxesProps) {
  return (
    <View
      className="flex-row flex-wrap"
      style={{ gap: 8, marginHorizontal: -4 }}
    >
      {boxes.map((b) => {
        const monthDate = new Date(`${b.yearMonth}-01T00:00:00`);
        const monthShort = formatDate(monthDate, 'long-month', lang).split(' ')[0];
        const intensity = b.total === null || max === 0 ? 0 : b.total / max;
        const fillAlpha = intensity === 0 ? 0 : Math.max(0.18, intensity);
        return (
          <View
            key={b.yearMonth}
            style={{
              width: '23%',                  // 4 cols (with the gap)
              aspectRatio: 1,
              marginHorizontal: 4,
              marginVertical: 4,
              borderRadius: 12,
              borderWidth: 1,
              borderColor,
              backgroundColor: !b.loaded
                ? borderColor + '66'         // skeleton — muted bg
                : intensity === 0
                  ? 'transparent'
                  : accent + alphaHex(fillAlpha),
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
              opacity: !b.loaded ? 0.6 : 1,
            }}
          >
            <Text
              className="font-sans-medium text-xs uppercase"
              style={{
                color:
                  !b.loaded
                    ? mutedColor
                    : intensity > 0.5
                      ? '#fff'
                      : fgColor,
                letterSpacing: 0.5,
              }}
              numberOfLines={1}
            >
              {monthShort}
            </Text>
            {b.loaded && b.total !== null ? (
              <Text
                className="font-mono tabular-nums mt-1"
                style={{
                  color: intensity > 0.5 ? '#fff' : mutedColor,
                  fontSize: 10,
                }}
                numberOfLines={1}
              >
                {compactIDR(b.total, lang)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// (Legacy YearHeatmap + YearHeatmapSkeleton removed — superseded by
// the stacked YearMonthGrid above. See git history before this commit
// for the at-a-glance 12x31 matrix variant.)

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
