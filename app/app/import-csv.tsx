import type { Account, Category } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import {
  Check, ChevronDown, ChevronLeft, FileSpreadsheet, Upload,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listAccounts } from '@/services/firestore/accountsService';
import { listCategories } from '@/services/firestore/categoriesService';
import { createTransaction } from '@/services/firestore/transactionsService';
import { useAuthUser } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import {
  parseCsvText, parseImportAmount, parseImportDate,
} from '@/shared/utils/csvParser';
import { formatIDR } from '@/shared/utils/formatIDR';

/**
 * /import-csv — bulk-import transactions from a bank statement CSV.
 *
 * Web only in v2 launch (per ADR — same pattern as voice input).
 * Native shows a friendly "v2.5 dev client" alert. v2.5 wires
 * `expo-document-picker` for native file selection.
 *
 * Four-step funnel:
 *   1. Pick file
 *   2. Map columns (date / amount / description) — auto-detected from
 *      headers, user-overrideable
 *   3. Pick destination account + default category
 *   4. Run import (sequential createTransaction calls; progress meter)
 *
 * Each transaction goes through the existing atomic-batch path so
 * balance + monthly totals stay consistent. Sequential rather than
 * parallel to keep error reporting straightforward — class-project
 * scope; v2.5 polish can parallelise via Promise.all chunked at 10.
 */
export default function ImportCsvScreen() {
  const { t, i18n } = useTranslation(['csvImport', 'common']);
  const router = useRouter();
  const appAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const accent = tokens.accent.transactions;

  const [parsed, setParsed] = useState<ReturnType<typeof parseCsvText> | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [dateCol, setDateCol] = useState<number>(-1);
  const [amountCol, setAmountCol] = useState<number>(-1);
  const [descCol, setDescCol] = useState<number>(-1);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [openPicker, setOpenPicker] = useState<'date' | 'amount' | 'desc' | 'account' | 'category' | null>(null);

  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState<{ count: number } | null>(null);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  // Load accounts + categories for the destination pickers.
  useEffect(() => {
    if (!wid) return;
    let cancelled = false;
    void Promise.all([listAccounts(wid), listCategories(wid)]).then(([a, c]) => {
      if (cancelled) return;
      setAccounts(a);
      setCategories(c);
    });
    return () => { cancelled = true; };
  }, [wid]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false;
      router.replace('/profile');
      return true;
    });
    return () => sub.remove();
  }, [router]);

  // ---- File pick (web) ----

  const handlePickFile = () => {
    if (Platform.OS !== 'web') {
      appAlert(t('csvImport:stepPickFile.unavailableTitle'), t('csvImport:stepPickFile.unavailableNative'));
      return;
    }
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv,text/plain,application/vnd.ms-excel';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? '');
        const result = parseCsvText(text);
        setParsed(result);
        setDateCol(result.guess.dateCol);
        setAmountCol(result.guess.amountCol);
        setDescCol(result.guess.descCol);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // ---- Import ----

  const previewCount = parsed?.rows.length ?? 0;

  // Recompute valid-row count whenever column mapping changes — gives
  // user a heads-up on how many rows will actually import.
  const validCount = useMemo(() => {
    if (!parsed || dateCol < 0 || amountCol < 0) return 0;
    let valid = 0;
    for (const row of parsed.rows) {
      const date = parseImportDate(row[dateCol] ?? '');
      const amount = parseImportAmount(row[amountCol] ?? '');
      if (date && amount !== null) valid += 1;
    }
    return valid;
  }, [parsed, dateCol, amountCol]);
  const skippedFromInvalid = previewCount - validCount;

  const canImport =
    parsed !== null && dateCol >= 0 && amountCol >= 0 && accountId !== null && categoryId !== null && validCount > 0;

  const handleRunImport = async () => {
    if (!canImport || !wid || !parsed || !accountId || !categoryId) return;
    setImporting(true);
    setImportProgress({ done: 0, total: validCount });
    let imported = 0;
    try {
      for (const row of parsed.rows) {
        const dateStr = row[dateCol] ?? '';
        const amountStr = row[amountCol] ?? '';
        const desc = descCol >= 0 ? (row[descCol] ?? '') : '';
        const date = parseImportDate(dateStr);
        const amount = parseImportAmount(amountStr);
        if (!date || amount === null) continue;
        const isExpense = amount < 0;
        await createTransaction(wid, {
          type: isExpense ? 'expense' : 'income',
          date,
          accountId,
          toAccountId: null,
          amount: Math.abs(amount),
          splits: [{ categoryId, amount: Math.abs(amount) }],
          description: desc.trim() || `CSV: ${fileName}`,
          source: 'manual',
          rawInput: null,
          confidence: null,
        });
        imported += 1;
        setImportProgress({ done: imported, total: validCount });
      }
      setImportDone({ count: imported });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('csvImport:stepImport.errors.importFailed');
      appAlert(t('csvImport:title'), msg);
    } finally {
      setImporting(false);
    }
  };

  // ---- Render ----

  const sectionLabelClass = 'font-sans-medium text-xs uppercase tracking-wider mb-3';

  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingTop: 48,
          paddingBottom: 24 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="self-center w-full max-w-md lg:max-w-3xl">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('common:actions.back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
            hitSlop={8}
            className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
          >
            <ChevronLeft size={22} color={fgColor} />
            <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
              {t('common:actions.back')}
            </Text>
          </Pressable>

          <Text className="font-sans-bold text-3xl mb-2" style={{ color: fgColor }}>
            {t('csvImport:title')}
          </Text>
          <Text className="font-sans text-sm mb-8" style={{ color: mutedColor, lineHeight: 20 }}>
            {t('csvImport:subtitle')}
          </Text>

          {/* ===== STEP 1: Pick file ===== */}
          <Text className={sectionLabelClass} style={{ color: mutedColor }}>
            {t('csvImport:stepPickFile.label')}
          </Text>
          <Card padding="lg" className="mb-6">
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <View
                style={{
                  width: 40, height: 40, borderRadius: 10,
                  backgroundColor: accent + '22',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <FileSpreadsheet size={20} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                {fileName ? (
                  <Text className="font-sans-medium text-sm" style={{ color: fgColor }} numberOfLines={1}>
                    {fileName}
                  </Text>
                ) : (
                  <Text className="font-sans text-xs" style={{ color: mutedColor }}>
                    {t('csvImport:stepPickFile.supportedFormats')}
                  </Text>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={fileName ? t('csvImport:stepPickFile.replaceCta') : t('csvImport:stepPickFile.pickCta')}
                onPress={handlePickFile}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: accent,
                }}
              >
                <Upload size={14} color="#fff" />
                <Text className="font-sans-medium text-xs text-white">
                  {fileName ? t('csvImport:stepPickFile.replaceCta') : t('csvImport:stepPickFile.pickCta')}
                </Text>
              </Pressable>
            </View>
          </Card>

          {/* ===== STEP 2: Column mapping ===== */}
          {parsed ? (
            <>
              <Text className={sectionLabelClass} style={{ color: mutedColor }}>
                {t('csvImport:stepMapColumns.label')}
              </Text>
              <Card padding="lg" className="mb-6">
                <ColumnPicker
                  label={t('csvImport:stepMapColumns.dateColumn')}
                  value={dateCol}
                  headers={parsed.headers}
                  isOpen={openPicker === 'date'}
                  onToggle={() => setOpenPicker((cur) => (cur === 'date' ? null : 'date'))}
                  onSelect={(idx) => { setDateCol(idx); setOpenPicker(null); }}
                  placeholder={t('csvImport:stepMapColumns.selectColumn')}
                  fgColor={fgColor}
                  mutedColor={mutedColor}
                  borderColor={borderColor}
                />
                <View style={{ height: 12 }} />
                <ColumnPicker
                  label={t('csvImport:stepMapColumns.amountColumn')}
                  value={amountCol}
                  headers={parsed.headers}
                  isOpen={openPicker === 'amount'}
                  onToggle={() => setOpenPicker((cur) => (cur === 'amount' ? null : 'amount'))}
                  onSelect={(idx) => { setAmountCol(idx); setOpenPicker(null); }}
                  placeholder={t('csvImport:stepMapColumns.selectColumn')}
                  fgColor={fgColor}
                  mutedColor={mutedColor}
                  borderColor={borderColor}
                />
                <View style={{ height: 12 }} />
                <ColumnPicker
                  label={t('csvImport:stepMapColumns.descColumn')}
                  value={descCol}
                  headers={parsed.headers}
                  isOpen={openPicker === 'desc'}
                  onToggle={() => setOpenPicker((cur) => (cur === 'desc' ? null : 'desc'))}
                  onSelect={(idx) => { setDescCol(idx); setOpenPicker(null); }}
                  placeholder={t('csvImport:stepMapColumns.selectColumn')}
                  fgColor={fgColor}
                  mutedColor={mutedColor}
                  borderColor={borderColor}
                  optional
                />

                {/* Mini preview — first 5 rows */}
                {dateCol >= 0 && amountCol >= 0 ? (
                  <View style={{ marginTop: 16 }}>
                    <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
                      {t('csvImport:stepMapColumns.previewLabel', { count: parsed.rows.length })}
                    </Text>
                    {parsed.rows.slice(0, 5).map((row, i) => {
                      const date = parseImportDate(row[dateCol] ?? '');
                      const amount = parseImportAmount(row[amountCol] ?? '');
                      const desc = descCol >= 0 ? (row[descCol] ?? '') : '';
                      const valid = date !== null && amount !== null;
                      return (
                        <View
                          key={i}
                          style={{
                            paddingVertical: 6,
                            borderTopWidth: i > 0 ? 1 : 0,
                            borderTopColor: borderColor,
                            opacity: valid ? 1 : 0.4,
                          }}
                        >
                          <View className="flex-row items-baseline justify-between">
                            <Text className="font-sans-medium text-xs" style={{ color: fgColor }}>
                              {date ?? row[dateCol] ?? '—'}
                            </Text>
                            <Text
                              className="font-mono tabular-nums text-xs"
                              style={{
                                color: amount !== null && amount < 0 ? tokens.semantic.danger : tokens.semantic.positive,
                              }}
                            >
                              {amount !== null ? formatIDR(Math.abs(amount), lang) : '—'}
                            </Text>
                          </View>
                          {desc ? (
                            <Text className="font-sans text-xs mt-0.5" style={{ color: mutedColor }} numberOfLines={1}>
                              {desc}
                            </Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </Card>
            </>
          ) : null}

          {/* ===== STEP 3: Destination ===== */}
          {parsed && dateCol >= 0 && amountCol >= 0 ? (
            <>
              <Text className={sectionLabelClass} style={{ color: mutedColor }}>
                {t('csvImport:stepDestination.label')}
              </Text>
              <Card padding="lg" className="mb-6">
                <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
                  {t('csvImport:stepDestination.accountLabel')}
                </Text>
                <View className="flex-row flex-wrap" style={{ gap: 6, marginBottom: 16 }}>
                  {accounts.filter((a) => !a.isArchived).map((acct) => {
                    const active = acct.id === accountId;
                    const tint = resolveCategoryColor(acct.color, isDark ? 'dark' : 'light');
                    return (
                      <Pressable
                        key={acct.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setAccountId(acct.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? tint : borderColor,
                          backgroundColor: active ? tint + '14' : 'transparent',
                        }}
                      >
                        <CategoryIcon name={acct.icon} color={tint} size={12} />
                        <Text className="font-sans-medium text-xs" style={{ color: active ? tint : fgColor }}>
                          {acct.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
                  {t('csvImport:stepDestination.categoryLabel')}
                </Text>
                <View className="flex-row flex-wrap" style={{ gap: 6 }}>
                  {categories.filter((c) => !c.isArchived && c.parentId !== null).slice(0, 20).map((cat) => {
                    const active = cat.id === categoryId;
                    const tint = resolveCategoryColor(cat.color, isDark ? 'dark' : 'light');
                    return (
                      <Pressable
                        key={cat.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setCategoryId(cat.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          paddingHorizontal: 9,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? tint : borderColor,
                          backgroundColor: active ? tint + '14' : 'transparent',
                        }}
                      >
                        <CategoryIcon name={cat.icon} color={tint} size={12} />
                        <Text className="font-sans-medium text-xs" style={{ color: active ? tint : fgColor }}>
                          {cat.name[lang]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="font-sans text-xs mt-3" style={{ color: mutedColor }}>
                  {t('csvImport:stepDestination.categoryHint')}
                </Text>
                <Text className="font-sans text-xs mt-2" style={{ color: mutedColor }}>
                  {t('csvImport:stepDestination.signHint')}
                </Text>
              </Card>
            </>
          ) : null}

          {/* ===== STEP 4: Run ===== */}
          {parsed && dateCol >= 0 && amountCol >= 0 ? (
            <>
              <Text className={sectionLabelClass} style={{ color: mutedColor }}>
                {t('csvImport:stepImport.label')}
              </Text>
              <Card padding="lg" className="mb-6">
                {importDone ? (
                  <View className="items-center">
                    <View
                      style={{
                        width: 56, height: 56, borderRadius: 14,
                        backgroundColor: tokens.semantic.positive + '22',
                        alignItems: 'center', justifyContent: 'center',
                        marginBottom: 16,
                      }}
                    >
                      <Check size={28} color={tokens.semantic.positive} strokeWidth={2.4} />
                    </View>
                    <Text className="font-sans-bold text-lg text-center mb-2" style={{ color: fgColor }}>
                      {t('csvImport:stepImport.doneTitle')}
                    </Text>
                    <Text
                      className="font-sans text-sm text-center mb-4"
                      style={{ color: mutedColor, lineHeight: 20 }}
                    >
                      {t('csvImport:stepImport.doneBody', { count: importDone.count })}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.replace('/transactions')}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: accent,
                        minHeight: 44,
                      }}
                    >
                      <Text className="font-sans-medium text-white text-sm">
                        {t('csvImport:actions.done')}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text className="font-sans text-sm mb-2" style={{ color: fgColor }}>
                      {t('csvImport:stepImport.preview', { count: validCount })}
                    </Text>
                    {skippedFromInvalid > 0 ? (
                      <Text className="font-sans text-xs mb-3" style={{ color: tokens.semantic.warning }}>
                        {t('csvImport:stepImport.warningSkipped', { count: skippedFromInvalid })}
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('csvImport:stepImport.importCta', { count: validCount })}
                      accessibilityState={{ disabled: !canImport || importing }}
                      disabled={!canImport || importing}
                      onPress={handleRunImport}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 12,
                        borderRadius: 10,
                        backgroundColor: accent,
                        minHeight: 44,
                        opacity: !canImport || importing ? 0.5 : 1,
                        marginTop: 8,
                      }}
                    >
                      <Text className="font-sans-medium text-white text-sm">
                        {importing
                          ? t('csvImport:stepImport.importing', importProgress)
                          : t('csvImport:stepImport.importCta', { count: validCount })}
                      </Text>
                    </Pressable>
                  </>
                )}
              </Card>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

// ---------- ColumnPicker ----------

type ColumnPickerProps = {
  label: string;
  value: number;
  headers: string[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (idx: number) => void;
  placeholder: string;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  optional?: boolean;
};

function ColumnPicker({
  label, value, headers, isOpen, onToggle, onSelect, placeholder,
  fgColor, mutedColor, borderColor, optional,
}: ColumnPickerProps) {
  const selectedLabel = value >= 0 ? (headers[value] ?? `Col ${value + 1}`) : '';
  return (
    <View>
      <Text className="font-sans-medium text-xs mb-1.5" style={{ color: mutedColor }}>
        {label}{optional ? ' · optional' : ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={onToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor,
          minHeight: 40,
        }}
      >
        <Text
          className="font-sans-medium text-sm flex-1"
          style={{ color: value >= 0 ? fgColor : mutedColor }}
          numberOfLines={1}
        >
          {value >= 0 ? selectedLabel : placeholder}
        </Text>
        <ChevronDown size={14} color={mutedColor} />
      </Pressable>
      {isOpen ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingTop: 8, paddingRight: 8 }}
        >
          {optional ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelect(-1)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor,
              }}
            >
              <Text className="font-sans-medium text-xs" style={{ color: mutedColor }}>
                —
              </Text>
            </Pressable>
          ) : null}
          {headers.map((h, idx) => {
            const active = idx === value;
            return (
              <Pressable
                key={idx}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSelect(idx)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? tokens.accent.transactions : borderColor,
                  backgroundColor: active ? tokens.accent.transactions + '14' : 'transparent',
                }}
              >
                <Text className="font-sans-medium text-xs" style={{ color: active ? tokens.accent.transactions : fgColor }}>
                  {h}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
