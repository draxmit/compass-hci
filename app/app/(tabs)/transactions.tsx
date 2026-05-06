import type { Account, Category, Transaction } from '@compass/shared-types';
import { useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

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
import { formatDate } from '@/shared/utils/formatDate';
import { formatIDR } from '@/shared/utils/formatIDR';

/**
 * (tabs)/transactions.tsx — minimal recent-transactions list. Subscribes
 * to the most recent 50 transactions across all months and renders them
 * grouped by date. T7 will replace this with the full FlashList +
 * chip filters + tap-to-edit flow; this lightweight version exists so
 * users can SEE their just-saved transactions without opening Firestore
 * console.
 */
export default function TransactionsScreen() {
  const { t, i18n } = useTranslation(['transactions', 'accounts', 'common']);
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    if (!wid) return;
    const unsubT = subscribeRecent(wid, 50, setTxs);
    const unsubA = subscribeAccounts(wid, setAccounts);
    const unsubC = subscribeCategories(wid, setCategories);
    return () => {
      unsubT();
      unsubA();
      unsubC();
    };
  }, [wid]);

  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  // Group transactions by date (already sorted desc by the subscription).
  const grouped = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of txs) {
      const list = groups.get(tx.date) ?? [];
      list.push(tx);
      groups.set(tx.date, list);
    }
    return [...groups.entries()];
  }, [txs]);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
      <View className="self-center w-full max-w-md">
        <Text className="font-sans-bold text-3xl mb-1">{t('transactions:title')}</Text>
        <Text className="font-sans text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-6">
          {grouped.length === 0
            ? t('transactions:emptyHint', { defaultValue: 'Tap + to log your first transaction.' })
            : ''}
        </Text>

        {grouped.map(([date, items]) => (
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
                  t={t}
                />
              ))}
            </Card>
          </View>
        ))}
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
  t: TFunction;
};

function TransactionRow({
  tx,
  accountsById,
  categoriesById,
  isDark,
  lang,
  fgColor,
  mutedColor,
  showDivider,
  t,
}: TransactionRowProps) {
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const account = accountsById.get(tx.accountId);
  const toAccount = tx.toAccountId ? accountsById.get(tx.toAccountId) : null;
  const splitCategory = tx.splits[0]?.categoryId ? categoriesById.get(tx.splits[0].categoryId) : null;

  // For a transfer, show the icon of the from-account; for expense/income
  // show the category icon (parent's icon if the category itself is gone
  // due to archive race; falls back to the account icon).
  let icon = splitCategory?.icon ?? account?.icon ?? 'tag';
  let tint = splitCategory?.color ?? account?.color ?? 'slate';
  if (tx.type === 'transfer' && account) {
    icon = account.icon;
    tint = account.color;
  }
  const swatch = resolveCategoryColor(tint, isDark ? 'dark' : 'light');

  // Primary label: description if present, else category name, else type.
  const primary = tx.description?.trim()
    || splitCategory?.name[lang]
    || t(`transactions:entry.types.${tx.type}`);

  // Secondary: account name + (for transfers) → to-account name
  const accountLabel = account?.name ?? '?';
  const secondary = tx.type === 'transfer' && toAccount
    ? `${accountLabel} → ${toAccount.name}`
    : accountLabel;

  // Amount: sign-aware. Expense displays negative (red), income positive
  // (green/positive token), transfer neutral.
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
    <View
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
    </View>
  );
}
