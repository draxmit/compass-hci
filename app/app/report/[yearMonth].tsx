import type {
  Account, Category, CategoryMonthTotal, Transaction,
} from '@compass/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { ChevronLeft, FileDown } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listAccounts } from '@/services/firestore/accountsService';
import { listCategories } from '@/services/firestore/categoriesService';
import { listMonthTotals } from '@/services/firestore/categoryMonthTotalsService';
import { listTransactions } from '@/services/firestore/transactionsService';
import { useAuthUser, useUserDoc } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { formatDate } from '@/shared/utils/formatDate';
import { formatAmountForDisplay } from '@/shared/utils/formatAmountForDisplay';
import { formatIDR } from '@/shared/utils/formatIDR';
import { formatPercent } from '@/shared/utils/formatPercent';

/**
 * /report/[yearMonth] — monthly summary report (T9 / ADR-10).
 *
 * Snapshot-style screen: 4 one-shot reads (no realtime subscriptions).
 * Read-only on screen; DOCX export deferred to v3.
 *
 * Renders:
 *  1. Three-number summary (income / expense / net) + delta vs last month
 *  2. Per-category breakdown sorted desc
 *  3. Top 5 expense transactions
 */
export default function MonthlyReportScreen() {
  const { t, i18n } = useTranslation(['report', 'common', 'transactions']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const userDoc = useUserDoc();
  const displayInIDR = userDoc?.displayInIDR ?? false;
  const wid = user ? `solo-${user.uid}` : null;
  const appAlert = useAppAlert();
  const [exporting, setExporting] = useState(false);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  // Route param. Validate format — anything else routes back home so a
  // typoed URL doesn't render garbage.
  const params = useLocalSearchParams<{ yearMonth?: string }>();
  const yearMonth = typeof params.yearMonth === 'string' && /^\d{4}-\d{2}$/.test(params.yearMonth)
    ? params.yearMonth
    : null;

  const lastYearMonth = useMemo(() => {
    if (!yearMonth) return null;
    const [y, m] = yearMonth.split('-').map(Number);
    if (!y || !m) return null;
    const prev = new Date(y, m - 2, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  }, [yearMonth]);

  const monthLabel = useMemo(() => {
    if (!yearMonth) return '';
    const d = new Date(`${yearMonth}-01T00:00:00`);
    return formatDate(d, 'long-month', lang);
  }, [yearMonth, lang]);

  const [thisTotals, setThisTotals] = useState<CategoryMonthTotal[]>([]);
  const [lastTotals, setLastTotals] = useState<CategoryMonthTotal[]>([]);
  const [thisTxs, setThisTxs] = useState<Transaction[]>([]);
  const [lastTxs, setLastTxs] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Hardware back: pop or fall back to /budgets (the only path that
  // currently opens the report).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false;
      router.replace('/budgets');
      return true;
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!wid || !yearMonth || !lastYearMonth) return;
    let cancelled = false;
    (async () => {
      try {
        const [tt, lt, txs, ltxs, cats, accs] = await Promise.all([
          listMonthTotals(wid, yearMonth),
          listMonthTotals(wid, lastYearMonth),
          // orderByDate:false skips the composite (yearMonth, date)
          // index requirement. The report only filters by tx.type and
          // sorts top-5 expenses by amount — never reads docs in date
          // order — so no index dependency is needed.
          listTransactions(wid, { yearMonth, orderByDate: false }),
          listTransactions(wid, { yearMonth: lastYearMonth, orderByDate: false }),
          listCategories(wid),
          listAccounts(wid),
        ]);
        if (cancelled) return;
        setThisTotals(tt);
        setLastTotals(lt);
        setThisTxs(txs);
        setLastTxs(ltxs);
        setCategories(cats);
        setAccounts(accs);
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        console.warn('[report] load failed', err);
        setLoadError(true);
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [wid, yearMonth, lastYearMonth]);

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const thisExpenseTotal = useMemo(
    () => thisTotals.reduce((s, m) => s + m.totalIDR, 0),
    [thisTotals],
  );
  const thisIncomeTotal = useMemo(
    () => thisTxs.filter((tx) => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0),
    [thisTxs],
  );
  const thisNet = thisIncomeTotal - thisExpenseTotal;

  const lastExpenseTotal = useMemo(
    () => lastTotals.reduce((s, m) => s + m.totalIDR, 0),
    [lastTotals],
  );
  const lastIncomeTotal = useMemo(
    () => lastTxs.filter((tx) => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0),
    [lastTxs],
  );
  const lastNet = lastIncomeTotal - lastExpenseTotal;

  // Per-category breakdown — all categories with spend this month, sorted desc.
  const breakdown = useMemo(
    () => [...thisTotals].sort((a, b) => b.totalIDR - a.totalIDR),
    [thisTotals],
  );

  // Top 5 expense transactions of the month, sorted by amount desc.
  const topExpenses = useMemo(
    () =>
      thisTxs
        .filter((tx) => tx.type === 'expense')
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    [thisTxs],
  );

  if (!yearMonth) {
    // Invalid URL param — bounce home.
    return (
      <View style={{ flex: 1, backgroundColor: overlayBg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text className="font-sans text-sm" style={{ color: mutedColor }}>
          {t('report:loadingFailed')}
        </Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: overlayBg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text className="font-sans text-sm" style={{ color: mutedColor }}>
          {t('report:loadingFailed')}
        </Text>
      </View>
    );
  }

  const noData = loaded && thisExpenseTotal === 0 && thisIncomeTotal === 0;

  // Export to Word OR PDF. Web-only — both `docx` and `jspdf` are
  // browser-targeted and pull in deps Metro rejects at bundle time.
  // Both modules are dynamic-imported on click so native bundles
  // cleanly. Native click shows a friendly 'use the web app' alert.
  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!yearMonth || !loaded || noData || exporting) return;
    if (Platform.OS !== 'web') {
      appAlert(
        t('report:export.nativeUnsupportedTitle'),
        t('report:export.nativeUnsupportedBody'),
      );
      return;
    }
    setExporting(true);
    try {
      // i18next's TFunction returns a special detailed-result type
      // depending on the key's namespace. The generators only need a
      // string-out; bridge with a thin adaptor that forces the result
      // through `String(...)`.
      const tStr = (key: string, opts?: Record<string, unknown>) =>
        String(t(key, opts as never));
      const sharedInput = {
        yearMonth,
        lang,
        monthLabel,
        thisIncomeTotal,
        thisExpenseTotal,
        thisNet,
        lastIncomeTotal,
        lastExpenseTotal,
        lastNet,
        breakdown,
        topExpenses,
        categoriesById,
        accountsById,
        t: tStr,
      };
      let blob: Blob;
      let filename: string;
      if (format === 'docx') {
        const { generateReportDocxBlob, reportDocxFilename } = await import(
          '@/features/reports/generateReportDocx'
        );
        blob = await generateReportDocxBlob(sharedInput);
        filename = reportDocxFilename(yearMonth);
      } else {
        const { generateReportPdfBlob, reportPdfFilename } = await import(
          '@/features/reports/generateReportPdf'
        );
        blob = await generateReportPdfBlob(sharedInput);
        filename = reportPdfFilename(yearMonth);
      }
      // Browser download via a transient anchor element. ObjectURL
      // released after the click handler so the browser has had a
      // chance to start the download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      appAlert(
        t('report:export.successTitle'),
        t('report:export.successBody', { filename }),
      );
    } catch (err) {
      console.warn('[report] export failed', err);
      appAlert(
        t('report:export.errorTitle'),
        t('report:export.errorBody'),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingTop: 48,
          paddingBottom: 24 + insets.bottom,
        }}
      >
        <View className="self-center w-full max-w-md lg:max-w-3xl">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('common:actions.back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/budgets'))}
            hitSlop={8}
            className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
          >
            <ChevronLeft size={22} color={fgColor} />
            <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
              {t('common:actions.back')}
            </Text>
          </Pressable>

          {/* Title row — heading on the left, two Export buttons (Word
              + PDF) on the right. Buttons hidden until data has loaded
              AND the month isn't empty (nothing to export). On native,
              both stay visible but the handler short-circuits with a
              friendly "web only for now" alert. */}
          <View className="flex-row items-start justify-between mb-6" style={{ gap: 12 }}>
            <Text className="font-sans-bold text-3xl flex-1" numberOfLines={2}>
              {t('report:title', { month: monthLabel })}
            </Text>
            {loaded && !noData ? (
              <View className="flex-row" style={{ gap: 6, marginTop: 4, flexShrink: 0 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('report:export.ctaWord')}
                  accessibilityState={{ disabled: exporting }}
                  onPress={() => handleExport('docx')}
                  disabled={exporting}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor,
                    minHeight: 36,
                    opacity: exporting ? 0.5 : 1,
                  }}
                >
                  <FileDown size={13} color={fgColor} />
                  <Text className="font-sans-medium text-xs" style={{ color: fgColor }}>
                    {exporting
                      ? t('report:export.exporting')
                      : t('report:export.ctaWord')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('report:export.ctaPdf')}
                  accessibilityState={{ disabled: exporting }}
                  onPress={() => handleExport('pdf')}
                  disabled={exporting}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor,
                    minHeight: 36,
                    opacity: exporting ? 0.5 : 1,
                  }}
                >
                  <FileDown size={13} color={fgColor} />
                  <Text className="font-sans-medium text-xs" style={{ color: fgColor }}>
                    {exporting
                      ? t('report:export.exporting')
                      : t('report:export.ctaPdf')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {!loaded ? null : noData ? (
            <Card padding="lg" className="items-center">
              <Text className="font-sans-bold text-lg text-center mb-2" style={{ color: fgColor }}>
                {t('report:empty.noData')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('report:empty.noDataCta')}
                onPress={() => router.replace('/transaction/new' as Href)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  marginTop: 8,
                  borderRadius: 10,
                  backgroundColor: tokens.accent.budgets,
                  minHeight: 44,
                }}
              >
                <Text className="font-sans-medium text-white text-sm">
                  {t('report:empty.noDataCta')}
                </Text>
              </Pressable>
            </Card>
          ) : (
            <>
              {/* Three-number summary. */}
              <View
                className="flex-row mb-6"
                style={{ gap: 12 }}
              >
                <SummaryCell
                  label={t('report:summary.income')}
                  amount={thisIncomeTotal}
                  delta={thisIncomeTotal - lastIncomeTotal}
                  color={tokens.semantic.positive}
                  lang={lang}
                  mutedColor={mutedColor}
                  fgColor={fgColor}
                  borderColor={borderColor}
                  t={t}
                />
                <SummaryCell
                  label={t('report:summary.expense')}
                  amount={thisExpenseTotal}
                  delta={thisExpenseTotal - lastExpenseTotal}
                  color={tokens.semantic.danger}
                  lang={lang}
                  mutedColor={mutedColor}
                  fgColor={fgColor}
                  borderColor={borderColor}
                  // For expense, "up" is bad → invert delta direction
                  // semantics so the colour reads correctly.
                  invertDelta
                  t={t}
                />
              </View>

              {/* Net hero — separate full-width card so the sign reads big. */}
              <View className="mb-8">
                <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
                  {t('report:summary.net')}
                </Text>
                <Text
                  className="font-mono tabular-nums text-4xl"
                  style={{ color: thisNet >= 0 ? tokens.semantic.positive : tokens.semantic.danger }}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {formatIDR(thisNet, lang)}
                </Text>
                <DeltaLine
                  delta={thisNet - lastNet}
                  lang={lang}
                  mutedColor={mutedColor}
                  t={t}
                />
              </View>

              {/* Per-category breakdown. */}
              {breakdown.length > 0 ? (
                <View className="mb-6">
                  <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
                    {t('report:sections.breakdown')}
                  </Text>
                  <Card padding="none">
                    {breakdown.map((row, idx) => (
                      <BreakdownRow
                        key={row.categoryId}
                        total={row}
                        category={categoriesById.get(row.categoryId)}
                        sumExpense={thisExpenseTotal}
                        showDivider={idx > 0}
                        isDark={isDark}
                        lang={lang}
                        fgColor={fgColor}
                        mutedColor={mutedColor}
                        borderColor={borderColor}
                      />
                    ))}
                  </Card>
                </View>
              ) : null}

              {/* Top expenses. */}
              {topExpenses.length > 0 ? (
                <View className="mb-2">
                  <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
                    {t('report:sections.topTransactions')}
                  </Text>
                  <Card padding="none">
                    {topExpenses.map((tx, idx) => (
                      <TopExpenseRow
                        key={tx.id}
                        tx={tx}
                        accountsById={accountsById}
                        categoriesById={categoriesById}
                        showDivider={idx > 0}
                        isDark={isDark}
                        lang={lang}
                        fgColor={fgColor}
                        mutedColor={mutedColor}
                        borderColor={borderColor}
                        displayInIDR={displayInIDR}
                        onPress={() => router.push(`/transaction/${tx.id}` as Href)}
                      />
                    ))}
                  </Card>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ---------- SummaryCell ----------

type SummaryCellProps = {
  label: string;
  amount: number;
  delta: number;
  color: string;
  lang: Locale;
  mutedColor: string;
  fgColor: string;
  borderColor: string;
  invertDelta?: boolean;
  t: TFunction;
};

function SummaryCell({
  label, amount, delta, color, lang, mutedColor, fgColor, borderColor, invertDelta, t,
}: SummaryCellProps) {
  // For expense, an UP delta is a regression → render in danger; for
  // income, an UP delta is a win → render in positive. invertDelta flips
  // the colour mapping for the expense cell.
  const goodWhenUp = !invertDelta;
  const direction = delta === 0 ? 'same' : delta > 0 ? 'up' : 'down';
  const deltaColor =
    direction === 'same'
      ? mutedColor
      : (direction === 'up') === goodWhenUp
        ? tokens.semantic.positive
        : tokens.semantic.danger;

  return (
    <View
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <Text className="font-sans-medium text-xs uppercase tracking-wider mb-1" style={{ color: mutedColor }}>
        {label}
      </Text>
      <Text
        className="font-mono tabular-nums text-xl"
        style={{ color }}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {formatIDR(amount, lang)}
      </Text>
      <Text className="font-sans text-xs mt-1" style={{ color: deltaColor }}>
        {direction === 'same'
          ? t('report:delta.same')
          : direction === 'up'
            ? t('report:delta.up', { amount: formatIDR(Math.abs(delta), lang) })
            : t('report:delta.down', { amount: formatIDR(Math.abs(delta), lang) })}
      </Text>
    </View>
  );
}

// ---------- DeltaLine ----------

type DeltaLineProps = {
  delta: number;
  lang: Locale;
  mutedColor: string;
  t: TFunction;
};

function DeltaLine({ delta, lang, mutedColor, t }: DeltaLineProps) {
  const direction = delta === 0 ? 'same' : delta > 0 ? 'up' : 'down';
  return (
    <Text className="font-sans text-xs mt-2" style={{ color: mutedColor }}>
      {t('report:delta.vsLastMonth')} —{' '}
      {direction === 'same'
        ? t('report:delta.same')
        : direction === 'up'
          ? t('report:delta.up', { amount: formatIDR(Math.abs(delta), lang) })
          : t('report:delta.down', { amount: formatIDR(Math.abs(delta), lang) })}
    </Text>
  );
}

// ---------- BreakdownRow ----------

type BreakdownRowProps = {
  total: CategoryMonthTotal;
  category: Category | undefined;
  sumExpense: number;
  showDivider: boolean;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
};

function BreakdownRow({
  total, category, sumExpense, showDivider, isDark, lang, fgColor, mutedColor, borderColor,
}: BreakdownRowProps) {
  const ratio = sumExpense === 0 ? 0 : total.totalIDR / sumExpense;
  const catColor = category
    ? resolveCategoryColor(category.color, isDark ? 'dark' : 'light')
    : mutedColor;
  const name = category?.name[lang] ?? '—';

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: borderColor,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
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
          {category ? (
            <CategoryIcon name={category.icon} color={catColor} size={14} />
          ) : null}
        </View>
        <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }} numberOfLines={1}>
          {name}
        </Text>
        <Text className="font-mono tabular-nums text-sm mr-3" style={{ color: fgColor }}>
          {formatIDR(total.totalIDR, lang)}
        </Text>
        <Text className="font-mono tabular-nums text-xs" style={{ color: mutedColor, minWidth: 48, textAlign: 'right' }}>
          {formatPercent(ratio, lang)}
        </Text>
      </View>
      <View
        style={{
          height: 4,
          marginLeft: 40,
          borderRadius: 2,
          backgroundColor: borderColor,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${ratio * 100}%`,
            height: 4,
            backgroundColor: catColor,
          }}
        />
      </View>
    </View>
  );
}

// ---------- TopExpenseRow ----------

type TopExpenseRowProps = {
  tx: Transaction;
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
  showDivider: boolean;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  displayInIDR: boolean;
  onPress: () => void;
};

function TopExpenseRow({
  tx, accountsById, categoriesById, showDivider, isDark, lang,
  fgColor, mutedColor, borderColor, displayInIDR, onPress,
}: TopExpenseRowProps) {
  const split = tx.splits[0];
  const category = split ? categoriesById.get(split.categoryId) : undefined;
  const account = accountsById.get(tx.accountId);
  const catColor = category
    ? resolveCategoryColor(category.color, isDark ? 'dark' : 'light')
    : mutedColor;
  const dateLabel = formatDate(new Date(tx.date), 'short', lang);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: borderColor,
        flexDirection: 'row',
        alignItems: 'center',
      }}
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
        {category ? (
          <CategoryIcon name={category.icon} color={catColor} size={16} />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text className="font-sans-medium text-sm" style={{ color: fgColor }} numberOfLines={1}>
          {tx.description || (category?.name[lang] ?? '—')}
        </Text>
        <Text className="font-sans text-xs mt-0.5" style={{ color: mutedColor }} numberOfLines={1}>
          {dateLabel}
          {account ? ` · ${account.name}` : ''}
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
                className="font-mono tabular-nums text-sm"
                style={{ color: tokens.semantic.danger }}
              >
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
