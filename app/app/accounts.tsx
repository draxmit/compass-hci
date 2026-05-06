import type {
  Account, AccountSubtype, AccountType, CategoryColor,
  CategoryIcon as CategoryIconKey,
} from '@compass/shared-types';
import { useRouter } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  archiveAccount, createAccount, setBalance, subscribeAccounts, updateAccount,
} from '@/services/firestore/accountsService';
import {
  ACCOUNT_TYPES, getSubtypeMeta, subtypesForType,
} from '@/shared/data/accountSubtypes';
import { useAuthUser } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { CATEGORY_COLOR_KEYS, resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { CATEGORY_ICON_KEYS, CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatIDR } from '@/shared/utils/formatIDR';

type EditTarget = { mode: 'create' } | { mode: 'edit'; account: Account };

/**
 * /accounts — list grouped by type, add/edit/archive, manual balance set.
 * Reached from Profile (under Categories). Realtime subscription keeps
 * balances fresh; T6 will mutate currentBalance via accountsService when
 * transactions land.
 */
export default function AccountsScreen() {
  const { t, i18n } = useTranslation(['accounts', 'common']);
  const { resolvedScheme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  useEffect(() => {
    if (!wid) return;
    return subscribeAccounts(wid, setAccounts);
  }, [wid]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editTarget) {
        setEditTarget(null);
        return true;
      }
      if (router.canGoBack()) return false;
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [router, editTarget]);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];

  const groups = useMemo(() => {
    return ACCOUNT_TYPES.map((type) => ({
      type,
      accounts: accounts.filter((a) => a.type === type),
    })).filter((g) => g.accounts.length > 0);
  }, [accounts]);

  const totalBalance = useMemo(
    () => accounts
      .filter((a) => a.includedInNetWorth)
      .reduce((sum, a) => sum + a.currentBalance, 0),
    [accounts],
  );

  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      {editTarget ? (
        <AccountEditPanel
          target={editTarget}
          onClose={() => setEditTarget(null)}
          wid={wid!}
          isDark={isDark}
          lang={lang}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 24,
            paddingTop: 48,
            paddingBottom: 24 + insets.bottom,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="self-center w-full max-w-md">
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

            <View className="flex-row items-end justify-between mb-1">
              <Text className="font-sans-bold text-3xl">{t('accounts:title')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('accounts:add')}
                onPress={() => setEditTarget({ mode: 'create' })}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: tokens.accent.dashboard,
                  minHeight: 36,
                }}
              >
                <Plus size={16} color="#fff" />
                <Text className="font-sans-medium text-white text-sm">
                  {t('accounts:addNew')}
                </Text>
              </Pressable>
            </View>
            <Text className="font-sans text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-6">
              {t('accounts:tagline')}
            </Text>

            {accounts.length === 0 ? (
              <Card padding="lg" className="items-center">
                <Text className="font-sans-semibold text-lg mb-2 text-center">
                  {t('accounts:empty.title')}
                </Text>
                <Text className="font-sans text-sm text-center mb-5" style={{ color: mutedColor }}>
                  {t('accounts:empty.body')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('accounts:empty.cta')}
                  onPress={() => setEditTarget({ mode: 'create' })}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: tokens.accent.dashboard,
                    minHeight: 44,
                  }}
                >
                  <Plus size={16} color="#fff" />
                  <Text className="font-sans-medium text-white text-sm">
                    {t('accounts:empty.cta')}
                  </Text>
                </Pressable>
              </Card>
            ) : (
              <>
                <Card padding="lg" className="mb-4 items-end">
                  <Text className="font-sans text-xs uppercase tracking-wider" style={{ color: mutedColor }}>
                    {t('accounts:totalBalance')}
                  </Text>
                  <Text
                    className="font-mono tabular-nums text-2xl mt-1"
                    style={{ color: fgColor }}
                  >
                    {formatIDR(totalBalance)}
                  </Text>
                </Card>
                {groups.map(({ type, accounts: items }) => (
                  <AccountGroup
                    key={type}
                    type={type}
                    accounts={items}
                    isDark={isDark}
                    onEditAccount={(a) => setEditTarget({ mode: 'edit', account: a })}
                  />
                ))}
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

type AccountGroupProps = {
  type: AccountType;
  accounts: Account[];
  isDark: boolean;
  onEditAccount: (a: Account) => void;
};

function AccountGroup({ type, accounts, isDark, onEditAccount }: AccountGroupProps) {
  const { t } = useTranslation(['accounts']);
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  return (
    <Card padding="none" className="mb-4">
      <View
        className="px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}
      >
        <Text className="font-sans-medium text-xs uppercase tracking-wider" style={{ color: mutedColor }}>
          {t(`accounts:types.${type}`)}
        </Text>
      </View>
      {accounts.map((account, idx) => {
        const tint = resolveCategoryColor(account.color, isDark ? 'dark' : 'light');
        return (
          <Pressable
            key={account.id}
            accessibilityRole="button"
            accessibilityLabel={account.name}
            onPress={() => onEditAccount(account)}
            className="flex-row items-center px-4 py-3 min-h-[44px]"
            style={{
              borderTopWidth: idx === 0 ? 0 : 1,
              borderTopColor: borderColor,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                backgroundColor: tint + '22',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <CategoryIcon name={account.icon} color={tint} size={18} />
            </View>
            <View className="flex-1">
              <Text className="font-sans-medium" style={{ color: fgColor }} numberOfLines={1}>
                {account.name}
              </Text>
              <Text className="font-sans text-xs" style={{ color: mutedColor }} numberOfLines={1}>
                {t(`accounts:subtypes.${account.subtype}`)}
              </Text>
            </View>
            <Text
              className="font-mono tabular-nums text-base"
              style={{ color: fgColor }}
            >
              {formatIDR(account.currentBalance)}
            </Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

type AccountEditPanelProps = {
  target: EditTarget;
  onClose: () => void;
  wid: string;
  isDark: boolean;
  lang: Locale;
};

function AccountEditPanel({ target, onClose, wid, isDark, lang: _lang }: AccountEditPanelProps) {
  const { t } = useTranslation(['accounts', 'common']);
  const insets = useSafeAreaInsets();
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const editing = target.mode === 'edit' ? target.account : null;
  const initialType: AccountType = editing?.type ?? 'bank';
  const initialSubtype: AccountSubtype = editing?.subtype ?? 'bca';
  const initialMeta = getSubtypeMeta(initialSubtype);

  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<AccountType>(initialType);
  const [subtype, setSubtypeState] = useState<AccountSubtype>(initialSubtype);
  const [balanceText, setBalanceText] = useState(
    String(editing?.currentBalance ?? 0),
  );
  const [includedInNetWorth, setIncludedInNetWorth] = useState(
    editing?.includedInNetWorth ?? true,
  );
  const [icon, setIcon] = useState<CategoryIconKey>(editing?.icon ?? initialMeta.icon);
  const [color, setColor] = useState<CategoryColor>(editing?.color ?? initialMeta.color);
  const [saving, setSaving] = useState(false);

  const isEdit = target.mode === 'edit';

  // Selecting a type narrows the subtype list. If the current subtype
  // doesn't belong to the new type, snap to that type's first subtype
  // and pull its default icon/colour.
  const handleTypeChange = (next: AccountType) => {
    setType(next);
    const validSubtypes = subtypesForType(next);
    const firstValid = validSubtypes[0];
    if (!firstValid) return;
    const stillValid = validSubtypes.some((s) => s.key === subtype);
    if (!stillValid) {
      setSubtypeState(firstValid.key);
      setIcon(firstValid.icon);
      setColor(firstValid.color);
    }
  };

  // Picking a subtype refreshes the suggested icon/colour ONLY when the
  // user hasn't customised them away from the previous default.
  const handleSubtypeChange = (next: AccountSubtype) => {
    const meta = getSubtypeMeta(next);
    const prevMeta = getSubtypeMeta(subtype);
    setSubtypeState(next);
    if (icon === prevMeta.icon) setIcon(meta.icon);
    if (color === prevMeta.color) setColor(meta.color);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!name.trim()) {
      Alert.alert(t('accounts:title'), t('accounts:errors.missingName'));
      return;
    }
    const balance = Number(balanceText.replace(/[^\d.-]/g, ''));
    if (Number.isNaN(balance)) {
      Alert.alert(t('accounts:title'), t('accounts:errors.balanceInvalid'));
      return;
    }
    setSaving(true);
    try {
      if (target.mode === 'create') {
        await createAccount(wid, {
          name: name.trim(),
          type,
          subtype,
          initialBalance: balance,
          includedInNetWorth,
          icon,
          color,
        });
      } else {
        await updateAccount(wid, editing!.id, {
          name: name.trim(),
          type,
          subtype,
          includedInNetWorth,
          icon,
          color,
        });
        if (balance !== editing!.currentBalance) {
          await setBalance(wid, editing!.id, balance);
        }
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : isEdit
          ? t('accounts:errors.updateFailed')
          : t('accounts:errors.createFailed');
      Alert.alert(t('accounts:title'), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!editing) return;
    Alert.alert(
      t('accounts:actions.archiveConfirmTitle'),
      t('accounts:actions.archiveConfirmBody'),
      [
        { text: t('accounts:actions.cancel'), style: 'cancel' },
        {
          text: t('accounts:actions.archive'),
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveAccount(wid, editing.id);
              onClose();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : t('accounts:errors.archiveFailed');
              Alert.alert(t('accounts:title'), msg);
            }
          },
        },
      ],
    );
  };

  const accent = resolveCategoryColor(color, isDark ? 'dark' : 'light');
  const filteredSubtypes = subtypesForType(type);

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        paddingTop: 48,
        paddingBottom: 24 + insets.bottom,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="self-center w-full max-w-md">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('common:actions.back')}
          onPress={onClose}
          hitSlop={8}
          className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
        >
          <ChevronLeft size={22} color={fgColor} />
          <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
            {t('common:actions.back')}
          </Text>
        </Pressable>

        <Text className="font-sans-bold text-3xl mb-4">
          {isEdit ? t('accounts:edit') : t('accounts:addCustom')}
        </Text>

        {/* Preview tile */}
        <View className="items-center my-2">
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: accent + '22',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CategoryIcon name={icon} color={accent} size={28} strokeWidth={2.2} />
          </View>
        </View>

        {/* Name */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('accounts:fields.name')}
          </Text>
          <TextField
            label=""
            value={name}
            onChangeText={setName}
            placeholder={t('accounts:fields.namePlaceholder')}
            autoCapitalize="words"
            returnKeyType="done"
          />
        </Card>

        {/* Type */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('accounts:fields.type')}
          </Text>
          <View className="flex-row" style={{ gap: 6 }}>
            {ACCOUNT_TYPES.map((typeKey) => {
              const selected = type === typeKey;
              return (
                <Pressable
                  key={typeKey}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => handleTypeChange(typeKey)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderColor: selected ? tokens.accent.dashboard : borderColor,
                    backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                  }}
                >
                  <Text
                    className="font-sans-medium text-xs"
                    style={{ color: selected ? tokens.accent.dashboard : fgColor }}
                  >
                    {t(`accounts:types.${typeKey}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Subtype */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('accounts:fields.subtype')}
          </Text>
          {filteredSubtypes.map((meta) => {
            const selected = meta.key === subtype;
            const tint = resolveCategoryColor(meta.color, isDark ? 'dark' : 'light');
            return (
              <Pressable
                key={meta.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => handleSubtypeChange(meta.key)}
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
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    backgroundColor: tint + '22',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <CategoryIcon name={meta.icon} color={tint} size={14} />
                </View>
                <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }}>
                  {t(`accounts:subtypes.${meta.key}`)}
                </Text>
              </Pressable>
            );
          })}
        </Card>

        {/* Balance */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('accounts:fields.balance')}
          </Text>
          <TextField
            label=""
            value={balanceText}
            onChangeText={setBalanceText}
            placeholder={t('accounts:fields.balancePlaceholder')}
            keyboardType="numeric"
            returnKeyType="done"
          />
          <Text className="font-sans text-xs mt-2" style={{ color: mutedColor }}>
            {isEdit ? t('accounts:fields.balanceEditHint') : t('accounts:fields.balanceHint')}
          </Text>
        </Card>

        {/* Net-worth toggle */}
        <Card padding="lg" className="mb-4">
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: includedInNetWorth }}
            onPress={() => setIncludedInNetWorth((v) => !v)}
            className="flex-row items-center"
          >
            <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }}>
              {t('accounts:fields.includedInNetWorth')}
            </Text>
            <View
              style={{
                width: 44,
                height: 26,
                borderRadius: 13,
                backgroundColor: includedInNetWorth ? tokens.accent.dashboard : borderColor,
                padding: 3,
                alignItems: includedInNetWorth ? 'flex-end' : 'flex-start',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: '#fff',
                }}
              />
            </View>
          </Pressable>
        </Card>

        {/* Icon */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('accounts:fields.icon')}
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {CATEGORY_ICON_KEYS.map((key) => {
              const selected = key === icon;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setIcon(key)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: selected ? accent : borderColor,
                    backgroundColor: selected ? accent + '22' : 'transparent',
                  }}
                >
                  <CategoryIcon name={key} color={selected ? accent : mutedColor} size={18} />
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Colour */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('accounts:fields.color')}
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 10 }}>
            {CATEGORY_COLOR_KEYS.map((key) => {
              const selected = key === color;
              const swatch = resolveCategoryColor(key, isDark ? 'dark' : 'light');
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={key}
                  accessibilityState={{ selected }}
                  onPress={() => setColor(key)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: swatch,
                    borderWidth: selected ? 3 : 0,
                    borderColor: isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'],
                  }}
                />
              );
            })}
          </View>
        </Card>

        <View className="flex-row gap-2 mt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('accounts:actions.cancel')}
            onPress={onClose}
            disabled={saving}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor,
              minHeight: 44,
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
              {t('accounts:actions.cancel')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('accounts:actions.save')}
            disabled={saving}
            onPress={handleSave}
            style={{
              flex: 2,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: tokens.accent.dashboard,
              opacity: saving ? 0.5 : 1,
              minHeight: 44,
            }}
          >
            <Text className="font-sans-medium text-white text-sm">
              {saving ? t('accounts:actions.saving') : t('accounts:actions.save')}
            </Text>
          </Pressable>
        </View>

        {isEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('accounts:actions.archive')}
            onPress={handleArchive}
            className="items-center justify-center mt-4 py-3 min-h-[44px]"
          >
            <Text className="font-sans-medium text-sm" style={{ color: tokens.semantic.danger }}>
              {t('accounts:actions.archive')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}
