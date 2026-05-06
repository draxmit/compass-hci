import type { Account, Category, Transaction, TransactionType } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { ChevronDown, Plus, X } from 'lucide-react-native';
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
  // Which filter pill (if any) is currently expanded. Only one open at a
  // time — Mercury/Linear-style dropdown chip pattern.
  const [openFilter, setOpenFilter] = useState<'type' | 'date' | null>(null);

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
      <View className="self-center w-full max-w-md lg:max-w-3xl">
        {/* Title now lives in MobileTopBar — no screen-level duplication. */}

        {/* Search — bare TextField; Card-wrap was making it look like a
            nested box. Hidden when there are no transactions to filter. */}
        {txs.length > 0 ? (
          <View className="mb-3">
            <TextField
              label=""
              value={search}
              onChangeText={setSearch}
              placeholder={t('transactions:filters.search')}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
        ) : null}

        {/* Filter pills — two compact dropdowns + optional Clear link.
            Tapping a pill expands its options below; only one expanded
            at a time. Hidden when there are no transactions to filter. */}
        {txs.length > 0 ? (
        <>
        <View className="flex-row items-center mb-2" style={{ gap: 8 }}>
          <FilterPill
            label={t('transactions:entry.fields.type')}
            value={typeChips.find((c) => c.key === typeFilter)?.label ?? ''}
            open={openFilter === 'type'}
            onPress={() => setOpenFilter((cur) => (cur === 'type' ? null : 'type'))}
            isDark={isDark}
          />
          <FilterPill
            label={t('transactions:entry.fields.date')}
            value={dateChips.find((c) => c.key === dateFilter)?.label ?? ''}
            open={openFilter === 'date'}
            onPress={() => setOpenFilter((cur) => (cur === 'date' ? null : 'date'))}
            isDark={isDark}
          />
          {filtersDirty ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('transactions:filters.clear')}
              onPress={() => {
                setSearch('');
                setTypeFilter('all');
                setDateFilter('this_month');
                setOpenFilter(null);
              }}
              hitSlop={6}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 1,
                borderColor,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 'auto',
              }}
            >
              <X size={14} color={mutedColor} />
            </Pressable>
          ) : null}
        </View>

        {/* Expanded options for the open pill. */}
        {openFilter === 'type' ? (
          <FilterOptionPanel
            options={typeChips}
            selectedKey={typeFilter}
            onSelect={(key) => {
              setTypeFilter(key);
              setOpenFilter(null);
            }}
            isDark={isDark}
          />
        ) : null}
        {openFilter === 'date' ? (
          <FilterOptionPanel
            options={dateChips}
            selectedKey={dateFilter}
            onSelect={(key) => {
              setDateFilter(key);
              setOpenFilter(null);
            }}
            isDark={isDark}
          />
        ) : null}

        <View className="mb-3" />
        </>
        ) : null}

        {grouped.length === 0 ? (
          txs.length === 0 ? (
            /* Truly empty — friendlier welcome card with NLP example. */
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
                {t('transactions:welcome.title')}
              </Text>
              <Text
                className="font-sans text-sm text-center mt-2 mb-4"
                style={{ color: mutedColor, lineHeight: 20 }}
              >
                {t('transactions:welcome.body')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('transactions:welcome.cta')}
                onPress={() => router.replace('/transaction/new')}
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
                  {t('transactions:welcome.cta')}
                </Text>
              </Pressable>
            </Card>
          ) : (
            <Card padding="lg">
              <Text className="font-sans text-sm text-center" style={{ color: mutedColor }}>
                {t('transactions:filters.noResults')}
              </Text>
            </Card>
          )
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

type FilterPillProps = {
  label: string;            // dimension name (e.g. "Type")
  value: string;            // current selection (e.g. "All")
  open: boolean;
  onPress: () => void;
  isDark: boolean;
};

function FilterPill({ label, value, open, onPress, isDark }: FilterPillProps) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: open ? tokens.accent.dashboard : borderColor,
        backgroundColor: open ? tokens.accent.dashboard + '14' : 'transparent',
        minHeight: 36,
        gap: 4,
      }}
    >
      <Text className="font-sans text-xs" style={{ color: mutedColor }}>
        {label}:
      </Text>
      <Text className="font-sans-medium text-xs" style={{ color: fgColor }}>
        {value}
      </Text>
      <ChevronDown
        size={14}
        color={open ? tokens.accent.dashboard : mutedColor}
        style={{
          transform: [{ rotate: open ? '180deg' : '0deg' }],
        }}
      />
    </Pressable>
  );
}

type FilterOptionPanelProps<K extends string> = {
  options: { key: K; label: string }[];
  selectedKey: K;
  onSelect: (key: K) => void;
  isDark: boolean;
};

function FilterOptionPanel<K extends string>({
  options,
  selectedKey,
  onSelect,
  isDark,
}: FilterOptionPanelProps<K>) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        marginBottom: 12,
      }}
    >
      {options.map((opt) => {
        const selected = opt.key === selectedKey;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(opt.key)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: selected ? tokens.accent.dashboard : borderColor,
              backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
            }}
          >
            <Text
              className="font-sans-medium text-xs"
              style={{ color: selected ? tokens.accent.dashboard : fgColor }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
