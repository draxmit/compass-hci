import type {
  Account, Category, CategoryColor, CategoryIcon as CategoryIconKey,
  Split, Transaction, TransactionType,
} from '@compass/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronLeft, ChevronRight, Layers } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { subscribeAccounts } from '@/services/firestore/accountsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import {
  createTransaction, deleteTransaction, getTransaction,
  InsufficientBalanceError, subscribeRecent, updateTransaction,
} from '@/services/firestore/transactionsService';
import { useAuthUser } from '@/stores/authStore';
import { SplitsEditorModal } from '@/features/transactions/SplitsEditorModal';
import { SplitsSummaryCard } from '@/features/transactions/SplitsSummaryCard';
import { TagsInput } from '@/features/transactions/TagsInput';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { DateField } from '@/shared/ui/DateField';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import {
  formatAmountInput, minorToInputText, parseAmountInput,
} from '@/shared/utils/amountInput';
import { formatIDR } from '@/shared/utils/formatIDR';
import { collectTagFrequencies, normaliseTagList } from '@/shared/utils/tags';

const TYPES: readonly TransactionType[] = ['expense', 'income', 'transfer'];

/**
 * /transaction/[id] — edit existing transaction. Mirrors /transaction/new
 * minus the NLP input. Save flow diffs against the loaded transaction:
 *   - description-only changes → updateTransaction (cheap doc patch).
 *   - any financial change → deleteTransaction + createTransaction
 *     (per ADR-08 §1; reuses the proven atomic-batch paths).
 *
 * Delete button at the bottom calls deleteTransaction directly with an
 * Alert confirmation.
 */
export default function EditTransactionScreen() {
  const { t, i18n } = useTranslation(['transactions', 'accounts', 'categories', 'common']);
  const router = useRouter();
  const appAlert = useAppAlert();
  const params = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;
  const txId = typeof params.id === 'string' ? params.id : null;

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState<Transaction | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [type, setType] = useState<TransactionType>('expense');
  const [amountText, setAmountText] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [feeText, setFeeText] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState<string>('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [recentTagSet, setRecentTagSet] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Splits state (ADR-14). Auto-detect mode on load: tx with > 1 split
  // opens directly into multi mode so the user sees the full breakdown
  // rather than silently losing rows past splits[0].
  const [splitsMode, setSplitsMode] = useState<'single' | 'multi'>('single');
  const [splitRows, setSplitRows] = useState<{ categoryId: string | null; amountText: string }[]>([]);
  // D4 redesign — multi-split editing happens in a modal now. Form
  // shows a SplitsSummaryCard while modal is closed.
  const [splitsModalOpen, setSplitsModalOpen] = useState(false);

  // Subscriptions for the picker lists + recent-50 tag suggestions.
  useEffect(() => {
    if (!wid) return;
    const unsubA = subscribeAccounts(wid, setAccounts);
    const unsubC = subscribeCategories(wid, setCategories);
    const unsubR = subscribeRecent(wid, 50, (txs) => {
      const freq = collectTagFrequencies(txs);
      setRecentTagSet([...freq.keys()]);
    });
    return () => { unsubA(); unsubC(); unsubR(); };
  }, [wid]);

  // Hardware back closes without saving.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false;
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [router]);

  // One-shot fetch of the transaction.
  useEffect(() => {
    if (!wid || !txId) return;
    getTransaction(wid, txId)
      .then((tx) => {
        if (!tx) {
          setLoadError(t('transactions:entry.loadingFailed'));
          return;
        }
        setLoaded(tx);
        setType(tx.type);
        setAmountText(minorToInputText(tx.amount, lang));
        setAccountId(tx.accountId);
        setToAccountId(tx.toAccountId);
        // Hydrate the fee field for transfer-with-fee txs. Older docs
        // without feeMinor read as undefined and leave the input empty.
        if (tx.type === 'transfer' && tx.feeMinor && tx.feeMinor > 0) {
          setFeeText(minorToInputText(tx.feeMinor, lang));
        }
        setCategoryId(tx.splits[0]?.categoryId ?? null);
        setDate(tx.date);
        setDescription(tx.description);
        // Pre-populate tags. Defensive `?? []` because legacy v1 docs
        // don't have the field.
        setTags(tx.tags ?? []);
        // ADR-14: auto-detect multi-split. Multi-split txs open in
        // multi mode so the user sees + can edit every split row.
        if (tx.splits.length > 1) {
          setSplitsMode('multi');
          setSplitRows(
            tx.splits.map((s) => ({
              categoryId: s.categoryId,
              amountText: minorToInputText(s.amount, lang),
            })),
          );
        }
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : t('transactions:entry.loadingFailed'));
      });
    // lang intentionally omitted — initial format only; user-typed changes
    // override regardless of locale flips after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid, txId]);

  const handleSave = async () => {
    if (saving || !wid || !loaded) return;
    const amount = parseAmountInput(amountText, lang);
    if (!amount) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.errors.missingAmount'));
      return;
    }
    if (!accountId) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.errors.missingAccount'));
      return;
    }
    if (type === 'transfer' && !toAccountId) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.errors.missingToAccount'));
      return;
    }
    if (type === 'transfer' && accountId === toAccountId) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.errors.sameAccount'));
      return;
    }

    // Build splits[] payload (ADR-14) — single or multi mode.
    let splits: Split[] = [];
    if (type !== 'transfer') {
      if (splitsMode === 'multi') {
        const parsed = splitRows.map((r) => ({
          categoryId: r.categoryId,
          amount: parseAmountInput(r.amountText, lang),
        }));
        if (parsed.some((r) => !r.categoryId)) {
          appAlert(t('transactions:entry.title'), t('transactions:entry.errors.splitsMissingCategory'));
          return;
        }
        const sum = parsed.reduce((s, r) => s + r.amount, 0);
        if (sum !== amount) {
          appAlert(t('transactions:entry.title'), t('transactions:entry.errors.splitsMustSumToTotal'));
          return;
        }
        splits = parsed.map((r) => ({ categoryId: r.categoryId as string, amount: r.amount }));
      } else {
        if (!categoryId) {
          appAlert(t('transactions:entry.title'), t('transactions:entry.errors.missingCategory'));
          return;
        }
        splits = [{ categoryId, amount } satisfies Split];
      }
    }

    // Diff financial fields. If only description changed we can use the
    // cheap path; otherwise delete + recreate. For splits we compare the
    // serialised shape — order matters.
    const splitsKey = (s: Split[]) =>
      s.map((x) => `${x.categoryId}:${x.amount}`).join('|');
    const splitsChanged = splitsKey(splits) !== splitsKey(loaded.splits);
    // Date is a financial field — changing it moves the tx into a
    // different yearMonth bucket, which affects category_month_totals.
    // Goes through delete + recreate just like amount/account changes.
    const dateChanged = date !== loaded.date;
    // Fee is a transfer-only financial field — changing it adjusts the
    // source account's balance delta, so it has to go through the
    // delete + recreate path like every other money-affecting edit.
    const newFeeMinor = type === 'transfer' ? parseAmountInput(feeText, lang) : 0;
    const oldFeeMinor = loaded.feeMinor ?? 0;
    const feeChanged = type === 'transfer' && newFeeMinor !== oldFeeMinor;
    const financialChanged =
      type !== loaded.type
      || amount !== loaded.amount
      || accountId !== loaded.accountId
      || dateChanged
      || (type === 'transfer' && toAccountId !== loaded.toAccountId)
      || feeChanged
      || (type !== 'transfer' && splitsChanged);

    // Detect non-financial changes (description / tags) so we can take
    // the cheap updateTransaction path when financial fields are
    // unchanged. Tags compare order-independently — applied order is
    // not user-meaningful.
    const normalisedTags = normaliseTagList(tags);
    const sortedJoin = (arr: string[]) => [...arr].sort().join(',');
    const tagsChanged = sortedJoin(normalisedTags) !== sortedJoin(loaded.tags ?? []);
    const descriptionChanged = description.trim() !== loaded.description;

    setSaving(true);
    try {
      if (!financialChanged) {
        if (!descriptionChanged && !tagsChanged) {
          // Nothing changed — just close.
          router.back();
          return;
        }
        await updateTransaction(wid, loaded.id, {
          ...(descriptionChanged ? { description: description.trim() } : {}),
          ...(tagsChanged ? { tags: normalisedTags } : {}),
        });
      } else {
        const sourceAccount = accounts.find((a) => a.id === accountId);
        await deleteTransaction(wid, loaded.id);
        await createTransaction(wid, {
          type,
          date,
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : null,
          currency: sourceAccount?.currency ?? loaded.currency ?? 'IDR',
          amount,
          ...(newFeeMinor > 0 ? { feeMinor: newFeeMinor } : {}),
          splits,
          description: description.trim(),
          tags: normalisedTags,
          source: 'manual',
          rawInput: null,
          confidence: null,
        });
      }
      router.back();
    } catch (err: unknown) {
      if (err instanceof InsufficientBalanceError) {
        appAlert(
          t('transactions:entry.title'),
          t('transactions:entry.errors.insufficientBalance'),
        );
      } else {
        const msg = err instanceof Error ? err.message : t('transactions:entry.errors.createFailed');
        appAlert(t('transactions:entry.title'), msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const enterMultiMode = () => {
    // Match /transaction/new — block split entry until amount > 0.
    const totalAmount = parseAmountInput(amountText, lang);
    if (totalAmount <= 0) {
      appAlert(
        t('transactions:entry.title'),
        t('transactions:entry.errors.splitsNeedTotal'),
      );
      return;
    }
    setSplitRows([
      {
        categoryId: categoryId,
        amountText: minorToInputText(totalAmount, lang),
      },
    ]);
    setSplitsMode('multi');
    setSplitsModalOpen(true);
  };

  const exitMultiMode = () => {
    if (splitRows.length > 1) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.splits.collapseWarning'));
    }
    const first = splitRows[0];
    if (first?.categoryId) setCategoryId(first.categoryId);
    setSplitsMode('single');
    setSplitsModalOpen(false);
  };

  const closeSplitsModal = () => {
    if (splitRows.every((r) => !r.categoryId)) {
      setSplitsMode('single');
      setSplitsModalOpen(false);
      return;
    }
    setSplitsModalOpen(false);
  };

  const addSplitRow = () => {
    setSplitRows((rows) => [...rows, { categoryId: null, amountText: '' }]);
  };
  const removeSplitRow = (idx: number) => {
    setSplitRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)));
  };
  const updateSplitRow = (idx: number, patch: Partial<{ categoryId: string | null; amountText: string }>) => {
    setSplitRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleDelete = () => {
    if (!loaded || !wid) return;
    appAlert(
      t('transactions:entry.actions.deleteConfirmTitle'),
      t('transactions:entry.actions.deleteConfirmBody'),
      [
        { text: t('transactions:entry.actions.cancel'), style: 'cancel' },
        {
          text: t('transactions:entry.actions.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteTransaction(wid, loaded.id);
              router.back();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : t('transactions:deleteFailed');
              appAlert(t('transactions:entry.title'), msg);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (!loaded && !loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: overlayBg, alignItems: 'center', justifyContent: 'center' }}>
        <Text className="font-sans text-sm" style={{ color: mutedColor }}>…</Text>
      </View>
    );
  }
  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: overlayBg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text className="font-sans text-sm text-center" style={{ color: tokens.semantic.danger }}>
          {loadError}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor }}
        >
          <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
            {t('common:actions.back')}
          </Text>
        </Pressable>
      </View>
    );
  }

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
            onPress={() => router.back()}
            hitSlop={8}
            className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
          >
            <ChevronLeft size={22} color={fgColor} />
            <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
              {t('common:actions.back')}
            </Text>
          </Pressable>

          <Text className="font-sans-bold text-3xl mb-4">{t('transactions:entry.editTitle')}</Text>

          {/* Type */}
          <Card padding="lg" className="mb-4">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('transactions:entry.fields.type')}
            </Text>
            <View className="flex-row" style={{ gap: 6 }}>
              {TYPES.map((typeKey) => {
                const selected = type === typeKey;
                return (
                  <Pressable
                    key={typeKey}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setType(typeKey)}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 44,
                      borderColor: selected ? tokens.accent.dashboard : borderColor,
                      backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                    }}
                  >
                    <Text
                      className="font-sans-medium text-sm"
                      style={{ color: selected ? tokens.accent.dashboard : fgColor }}
                    >
                      {t(`transactions:entry.types.${typeKey}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Amount + Date — same consolidation as /transaction/new. */}
          <Card padding="lg" className="mb-4">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('transactions:entry.fields.amount')}
            </Text>
            <TextField
              label=""
              value={amountText}
              onChangeText={(v) => setAmountText(formatAmountInput(v, lang))}
              placeholder={t('transactions:entry.fields.amountPlaceholder')}
              keyboardType="numeric"
              returnKeyType="done"
            />
            {amountText ? (
              <Text className="font-mono tabular-nums text-xs mt-2" style={{ color: mutedColor }}>
                {formatIDR(parseAmountInput(amountText, lang))}
              </Text>
            ) : null}

            <View
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: borderColor,
              }}
            >
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
                {t('transactions:entry.fields.date')}
              </Text>
              <DateField
                value={date}
                onChange={(next) => {
                  // Empty = revert to loaded.date so the tx always has
                  // a date. Editing the date triggers delete + recreate
                  // because yearMonth changes.
                  setDate(next || (loaded?.date ?? new Date().toISOString().slice(0, 10)));
                }}
                lang={lang}
                accessibilityLabel={t('transactions:entry.fields.date')}
              />
            </View>
          </Card>

          {/* From / single account */}
          <AccountPicker
            label={t(type === 'transfer' ? 'transactions:entry.fields.fromAccount' : 'transactions:entry.fields.account')}
            accounts={accounts}
            selectedId={accountId}
            onSelect={setAccountId}
            isDark={isDark}
            t={t}
          />

          {type === 'transfer' ? (
            <AccountPicker
              label={t('transactions:entry.fields.toAccount')}
              accounts={accounts}
              selectedId={toAccountId}
              onSelect={setToAccountId}
              isDark={isDark}
              t={t}
            />
          ) : null}

          {/* Admin / transfer fee — same field as /transaction/new.
              Pre-filled from the loaded tx when present; editing it
              triggers the delete + recreate path so the source-balance
              delta gets recomputed correctly. */}
          {type === 'transfer' ? (
            <View className="mb-5">
              <Text
                className="font-sans-medium text-xs uppercase tracking-wider mb-2"
                style={{ color: mutedColor }}
              >
                {t('transactions:entry.fields.fee')}
              </Text>
              <TextField
                label=""
                value={feeText}
                onChangeText={(text) => setFeeText(formatAmountInput(text, lang))}
                placeholder={t('transactions:entry.fields.feePlaceholder')}
                keyboardType="numeric"
              />
              <Text
                className="font-sans text-xs mt-1.5"
                style={{ color: mutedColor }}
              >
                {t('transactions:entry.fields.feeHint')}
              </Text>
            </View>
          ) : null}

          {type !== 'transfer' ? (
            <>
              {splitsMode === 'single' ? (
                <CategoryPicker
                  categories={categories}
                  selectedId={categoryId}
                  onSelect={setCategoryId}
                  isDark={isDark}
                  lang={lang}
                  t={t}
                  onRequestSplit={enterMultiMode}
                />
              ) : (
                <SplitsSummaryCard
                  rows={splitRows}
                  categories={categories}
                  isDark={isDark}
                  lang={lang}
                  onEdit={() => setSplitsModalOpen(true)}
                  onCollapse={exitMultiMode}
                  t={t}
                />
              )}
            </>
          ) : null}

          {/* Splits editor modal — opened by Edit button + enterMultiMode. */}
          {type !== 'transfer' ? (
            <SplitsEditorModal
              visible={splitsModalOpen}
              onClose={closeSplitsModal}
              onConfirm={() => setSplitsModalOpen(false)}
              rows={splitRows}
              totalText={amountText}
              categories={categories}
              lang={lang}
              onAddRow={addSplitRow}
              onRemoveRow={removeSplitRow}
              onUpdateRow={updateSplitRow}
              t={t}
            />
          ) : null}

          {/* Notes group: Description + Tags merged into one Card with
              internal divider, matching /transaction/new. Both are
              non-financial metadata; either can save via the cheap
              updateTransaction path. */}
          <Card padding="lg" className="mb-4">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('transactions:entry.fields.description')}
            </Text>
            <TextField
              label=""
              value={description}
              onChangeText={setDescription}
              placeholder={t('transactions:entry.fields.descriptionPlaceholder')}
              autoCapitalize="sentences"
              returnKeyType="done"
            />

            <View
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: borderColor,
              }}
            >
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
                {t('transactions:entry.fields.tags')}
              </Text>
              <TagsInput
                value={tags}
                onChange={setTags}
                suggestions={recentTagSet}
                accent={tokens.accent.transactions}
              />
            </View>
          </Card>

          <View className="flex-row gap-2 mt-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('transactions:entry.actions.cancel')}
              onPress={() => router.back()}
              disabled={saving || deleting}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                minHeight: 44,
                opacity: saving || deleting ? 0.5 : 1,
              }}
            >
              <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                {t('transactions:entry.actions.cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('transactions:entry.actions.save')}
              disabled={saving || deleting}
              onPress={handleSave}
              style={{
                flex: 2,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: tokens.accent.dashboard,
                opacity: saving || deleting ? 0.5 : 1,
                minHeight: 44,
              }}
            >
              <Text className="font-sans-medium text-white text-sm">
                {saving ? t('transactions:entry.actions.saving') : t('transactions:entry.actions.save')}
              </Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('transactions:entry.actions.delete')}
            onPress={handleDelete}
            disabled={deleting || saving}
            className="items-center justify-center mt-4 py-3 min-h-[44px]"
            style={{ opacity: deleting || saving ? 0.5 : 1 }}
          >
            <Text className="font-sans-medium text-sm" style={{ color: tokens.semantic.danger }}>
              {deleting ? t('transactions:entry.actions.deleting') : t('transactions:entry.actions.delete')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------- Pickers (clones of new.tsx — could be extracted to shared
//            components in a follow-up; keeping duplicate to avoid
//            destabilising /transaction/new during T7) ----------

type PickerCommonProps = { isDark: boolean; t: TFunction };

function AccountPicker({
  label, accounts, selectedId, onSelect, isDark, t,
}: PickerCommonProps & {
  label: string;
  accounts: Account[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  return (
    <Card padding="lg" className="mb-4">
      <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
        {label}
      </Text>
      {accounts.length === 0 ? (
        <Text className="font-sans text-sm" style={{ color: mutedColor }}>
          {t('transactions:entry.pickers.noAccounts')}
        </Text>
      ) : (
        accounts.map((acct) => {
          const tint = resolveCategoryColor(acct.color, isDark ? 'dark' : 'light');
          const selected = selectedId === acct.id;
          return (
            <Pressable
              key={acct.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelect(acct.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: selected ? tokens.accent.dashboard : borderColor,
                backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                marginBottom: 6,
              }}
            >
              <View style={{
                width: 28, height: 28, borderRadius: 7, backgroundColor: tint + '22',
                alignItems: 'center', justifyContent: 'center', marginRight: 10,
              }}>
                <CategoryIcon name={acct.icon} color={tint} size={14} />
              </View>
              <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }} numberOfLines={1}>
                {acct.name}
              </Text>
              <Text
                className="font-sans text-xs"
                style={{ color: mutedColor, marginLeft: 6, maxWidth: '40%' }}
                numberOfLines={1}
              >
                {t(`accounts:subtypes.${acct.subtype}`)}
              </Text>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}

function CategoryPicker({
  categories, selectedId, onSelect, isDark, lang, t, onRequestSplit,
}: PickerCommonProps & {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  lang: Locale;
  onRequestSplit?: () => void;
}) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const { groups, standalone } = useMemo(() => {
    const parents = categories.filter((c) => c.parentId === null);
    const grouped = parents
      .map((parent) => ({
        parent,
        children: categories.filter((c) => c.parentId === parent.id).sort((a, b) => a.order - b.order),
      }))
      .filter((g) => g.children.length > 0)
      .sort((a, b) => a.parent.order - b.parent.order);
    const childlessTopLevel = parents.filter((p) => !categories.some((c) => c.parentId === p.id))
      .sort((a, b) => a.order - b.order);
    return { groups: grouped, standalone: childlessTopLevel };
  }, [categories]);

  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    if (selectedId) {
      const sel = categories.find((c) => c.id === selectedId);
      if (sel?.parentId) set.add(sel.parentId);
    }
    return set;
  }, [selectedId, categories]);
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  useEffect(() => {
    if (!selectedId) return;
    const sel = categories.find((c) => c.id === selectedId);
    if (!sel?.parentId) return;
    setExpanded((prev) => (prev.has(sel.parentId!) ? prev : new Set([...prev, sel.parentId!])));
  }, [selectedId, categories]);

  function toggleGroup(parentId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId); else next.add(parentId);
      return next;
    });
  }

  const total = groups.reduce((s, g) => s + g.children.length, 0) + standalone.length;

  return (
    <Card padding="lg" className="mb-4">
      <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
        {t('transactions:entry.fields.category')}
      </Text>
      {total === 0 ? (
        <Text className="font-sans text-sm" style={{ color: mutedColor }}>
          {t('transactions:entry.pickers.noCategories')}
        </Text>
      ) : (
        <>
          {groups.map(({ parent, children }) => {
            const isExpanded = expanded.has(parent.id);
            const tint = resolveCategoryColor(parent.color, isDark ? 'dark' : 'light');
            const containsSelected = children.some((c) => c.id === selectedId);
            return (
              <View key={parent.id} style={{
                borderWidth: 1,
                borderColor: containsSelected ? tokens.accent.dashboard : borderColor,
                borderRadius: 10, marginBottom: 8, overflow: 'hidden',
              }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  onPress={() => toggleGroup(parent.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', padding: 10,
                    backgroundColor: containsSelected ? tokens.accent.dashboard + '14' : 'transparent',
                  }}
                >
                  <View style={{
                    width: 24, height: 24, borderRadius: 6, backgroundColor: tint + '22',
                    alignItems: 'center', justifyContent: 'center', marginRight: 10,
                  }}>
                    <CategoryIcon name={parent.icon} color={tint} size={14} />
                  </View>
                  <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }}>
                    {parent.name[lang]}
                  </Text>
                  {isExpanded ? <ChevronDown size={16} color={mutedColor} /> : <ChevronRight size={16} color={mutedColor} />}
                </Pressable>
                {isExpanded ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ gap: 6, padding: 10 }}
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: borderColor,
                    }}
                  >
                    {children.map((child) => {
                      const childTint = resolveCategoryColor(child.color, isDark ? 'dark' : 'light');
                      const selected = selectedId === child.id;
                      return (
                        <Pressable
                          key={child.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => onSelect(child.id)}
                          style={{
                            flexDirection: 'row', alignItems: 'center',
                            paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16,
                            borderWidth: 1,
                            borderColor: selected ? tokens.accent.dashboard : borderColor,
                            backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                          }}
                        >
                          <CategoryIcon name={child.icon} color={childTint} size={12} />
                          <Text className="font-sans-medium text-xs ml-1.5" style={{ color: fgColor }}>
                            {child.name[lang]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>
            );
          })}
          {standalone.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {standalone.map((cat) => {
                const tint = resolveCategoryColor(cat.color, isDark ? 'dark' : 'light');
                const selected = selectedId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onSelect(cat.id)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16,
                      borderWidth: 1,
                      borderColor: selected ? tokens.accent.dashboard : borderColor,
                      backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                    }}
                  >
                    <CategoryIcon name={cat.icon} color={tint} size={12} />
                    <Text className="font-sans-medium text-xs ml-1.5" style={{ color: fgColor }}>
                      {cat.name[lang]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      )}
      {/* Split-mode entry — same pattern as the new-tx CategoryPicker. */}
      {onRequestSplit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('transactions:entry.splits.toggleToMulti')}
          onPress={onRequestSplit}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 14,
            paddingTop: 14,
            paddingBottom: 4,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            minHeight: 40,
          }}
        >
          <Layers size={14} color={tokens.accent.transactions} />
          <Text
            className="font-sans-medium text-sm"
            style={{ color: tokens.accent.transactions }}
          >
            {t('transactions:entry.splits.toggleToMulti')}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

// Amount-input helpers were extracted to `shared/utils/amountInput.ts`
// in T9 / ADR-10 once /budgets needed the same logic.

// Suppress unused-import warning for CategoryIconKey/CategoryColor used only
// for type narrowing within the form state.
void (null as unknown as CategoryIconKey | CategoryColor | null);
