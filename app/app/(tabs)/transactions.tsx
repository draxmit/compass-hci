import type { Account, Category, Transaction, TransactionType } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { subscribeAccounts } from '@/services/firestore/accountsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import { subscribeRecent } from '@/services/firestore/transactionsService';
import { useAuthUser } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatDate } from '@/shared/utils/formatDate';
import { formatIDR } from '@/shared/utils/formatIDR';

type TypeFilter = 'all' | TransactionType;
type DateFilter = 'this_month' | 'last_month' | 'all_time';

/**
 * (tabs)/transactions.tsx — recent transactions list with chip filters
 * + tap-to-edit. Subscribes to the most recent 50 transactions across all
 * months; filters run client-side.
 *
 * v1 simplification: the 50-tx subscription cap means "All time" filter
 * actually shows the last 50 (ADR-08 §3). When a real user has hundreds
 * of transactions a future polish pass should switch to a yearMonth-driven
 * subscription with paged "load older" affordance.
 */
export default function TransactionsScreen() {
  const { t, i18n } = useTranslation(['transactions', 'accounts', 'common']);
  const router = useRouter();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('this_month');

  useEffect(() => {
    if (!wid) return;
    const unsubT = subscribeRecent(wid, 50, setTxs);
    const unsubA = subscribeAccounts(wid, setAccounts);
    const unsubC = subscribeCategories(wid, setCategories);
    return () => { unsubT(); unsubA(); unsubC(); };
  }, [wid]);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const now = new Date();
    const thisYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastYearMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const lower = search.trim().toLowerCase();

    return txs.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (dateFilter === 'this_month' && tx.yearMonth !== thisYearMonth) return false;
      if (dateFilter === 'last_month' && tx.yearMonth !== lastYearMonth) return false;
      if (lower && !tx.description.toLowerCase().includes(lower)) return false;
      return true;
    });
  }, [txs, typeFilter, dateFilter, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const list = groups.get(tx.date) ?? [];
      list.push(tx);
      groups.set(tx.date, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const filtersDirty = search.trim() !== '' || typeFilter !== 'all' || dateFilter !== 'this_month';

  const typeChips: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: t('transactions:filters.allTypes') },
    { key: 'expense', label: t('transactions:entry.types.expense') },
    { key: 'income', label: t('transactions:entry.types.income') },
    { key: 'transfer', label: t('transactions:entry.types.transfer') },
  ];

  const dateChips: { key: DateFilter; label: string }[] = [
    { key: 'this_month', label: t('transactions:filters.thisMonth') },
    { key: 'last_month', label: t('transactions:filters.lastMonth') },
    { key: 'all_time', label: t('transactions:filters.allTime') },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
      <View className="self-center w-full max-w-md">
        <Text className="font-sans-bold text-3xl mb-4">{t('transactions:title')}</Text>

        {/* Search */}
        <Card padding="lg" className="mb-3">
          <TextField
            label=""
            value={search}
            onChangeText={setSearch}
            placeholder={t('transactions:filters.search')}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </Card>

        {/* Type chips */}
        <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
          {typeChips.map((chip) => {
            const selected = typeFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setTypeFilter(chip.key)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: selected ? tokens.accent.dashboard : borderColor,
                  backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                }}
              >
                <Text
                  className="font-sans-medium text-xs"
                  style={{ color: selected ? tokens.accent.dashboard : fgColor }}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Date chips */}
        <View className="flex-row flex-wrap mb-4" style={{ gap: 6 }}>
          {dateChips.map((chip) => {
            const selected = dateFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setDateFilter(chip.key)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: selected ? tokens.accent.dashboard : borderColor,
                  backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                }}
              >
                <Text
                  className="font-sans-medium text-xs"
                  style={{ color: selected ? tokens.accent.dashboard : fgColor }}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
          {filtersDirty ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('transactions:filters.clear')}
              onPress={() => {
                setSearch('');
                setTypeFilter('all');
                setDateFilter('this_month');
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
              }}
            >
              <Text className="font-sans-medium text-xs" style={{ color: mutedColor, textDecorationLine: 'underline' }}>
                {t('transactions:filters.clear')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {grouped.length === 0 ? (
          <Card padding="lg">
            <Text className="font-sans text-sm text-center" style={{ color: mutedColor }}>
              {txs.length === 0
                ? t('transactions:emptyHint')
                : t('transactions:filters.noResults')}
            </Text>
          </Card>
        ) : (
          grouped.map(([date, items]) => (
            <View key={date} className="mb-4">
              <Text
                className="font-sans-medium text-xs uppercase tracking-wider mb-2 px-4"
                style={{ color: mutedColor }}
              >
                {formatDate(new Date(date), 'long', lang)}
              </Text>
              <Card padding="none">
                {items.map((tx, idx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    accountsById={accountsById}
                    categoriesById={categoriesById}
                    isDark={isDark}
                    lang={lang}
                    fgColor={fgColor}
                    mutedColor={mutedColor}
                    showDivider={idx > 0}
                    onPress={() => router.push(`/transaction/${tx.id}` as Href)}
                    t={t}
                  />
                ))}
              </Card>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

type TransactionRowProps = {
  tx: Transaction;
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  showDivider: boolean;
  onPress: () => void;
  t: TFunction;
};

function TransactionRow({
  tx, accountsById, categoriesById, isDark, lang, fgColor, mutedColor, showDivider, onPress, t,
}: TransactionRowProps) {
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const account = accountsById.get(tx.accountId);
  const toAccount = tx.toAccountId ? accountsById.get(tx.toAccountId) : null;
  const splitCategory = tx.splits[0]?.categoryId ? categoriesById.get(tx.splits[0].categoryId) : null;

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

  const accountLabel = account?.name ?? '?';
  const secondary = tx.type === 'transfer' && toAccount
    ? `${accountLabel} → ${toAccount.name}`
    : accountLabel;

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
      style={{
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: borderColor,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          backgroundColor: swatch + '22',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <CategoryIcon name={icon} color={swatch} size={18} />
      </View>
      <View className="flex-1">
        <Text className="font-sans-medium" style={{ color: fgColor }} numberOfLines={1}>
          {primary}
        </Text>
        <Text className="font-sans text-xs" style={{ color: mutedColor }} numberOfLines={1}>
          {secondary}
        </Text>
      </View>
      <Text
        className="font-mono tabular-nums text-base font-sans-semibold"
        style={{ color: amountColor }}
      >
        {amountPrefix}
        {formatIDR(tx.amount)}
      </Text>
    </Pressable>
  );
}
