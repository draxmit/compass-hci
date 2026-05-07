import type { AccountSubtype, AccountType } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';

import { createAccount } from '@/services/firestore/accountsService';
import { useAuthStore } from '@/stores/authStore';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
import { ACCOUNT_TYPES, getSubtypeMeta, subtypesForType } from '@/shared/data/accountSubtypes';
import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatAmountInput, parseAmountInput } from '@/shared/utils/amountInput';

/**
 * Step 3 — Add the user's first account. Reuses the same shape as the
 * /accounts CRUD form but pared down: no archive flag, no manual
 * order-picking, no included-in-net-worth toggle (default true). Just
 * name + type + subtype + initial balance.
 *
 * On Next: calls `accountsService.createAccount` with sensible defaults,
 * then advances to step 4. Skip works without creating anything.
 */
export default function AccountStep() {
  const { t, i18n } = useTranslation(['onboarding', 'accounts', 'common']);
  const router = useRouter();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const uid = useAuthStore.getState().uid;
  const wid = uid ? `solo-${uid}` : null;

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [subtype, setSubtype] = useState<AccountSubtype>('bca');
  const [balanceText, setBalanceText] = useState('');
  const [busy, setBusy] = useState(false);

  const subtypeOptions = useMemo(() => subtypesForType(type), [type]);

  const handleTypePress = (next: AccountType) => {
    setType(next);
    // Reset subtype to the first one for the chosen type — keeps the
    // chip grid consistent with the chosen account type.
    const first = subtypesForType(next)[0];
    if (first) setSubtype(first.key);
  };

  const handleNext = async () => {
    if (busy) return;
    if (!wid) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      // Name is the only required field; without a sensible label the
      // account is unhelpful. Just block the Next press silently —
      // primaryDisabled below would be cleaner but Skip is always
      // available for users who don't want to add an account.
      return;
    }
    setBusy(true);
    try {
      const meta = getSubtypeMeta(subtype);
      const balanceMinor = parseAmountInput(balanceText, lang);
      await createAccount(wid, {
        name: trimmedName,
        type,
        subtype,
        initialBalance: balanceMinor,
        includedInNetWorth: true,
        icon: meta.icon,
        color: meta.color,
      });
      router.push('/(onboarding)/first-budget');
    } catch (err) {
      console.warn('[onboarding] account create failed', err);
      Alert.alert(t('onboarding:account.title'), t('onboarding:account.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell
      step={3}
      title={t('onboarding:account.title')}
      body={t('onboarding:account.body')}
      onPrimary={handleNext}
      primaryBusy={busy}
      primaryDisabled={!name.trim()}
    >
      <View style={{ gap: 16 }}>
        <TextField
          label={t('accounts:fields.name') as string}
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding:account.namePlaceholder')}
          autoCapitalize="words"
          returnKeyType="next"
        />

        <View>
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
            {t('onboarding:account.typeLabel')}
          </Text>
          <View
            className="flex-row"
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 10,
              padding: 4,
              gap: 4,
            }}
          >
            {ACCOUNT_TYPES.map((opt) => {
              const active = type === opt;
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => handleTypePress(opt)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: active ? tokens.accent.dashboard + '22' : 'transparent',
                  }}
                >
                  <Text
                    className="font-sans-medium text-xs"
                    style={{ color: active ? tokens.accent.dashboard : mutedColor }}
                    numberOfLines={1}
                  >
                    {t(`accounts:types.${opt}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
            {t('onboarding:account.subtypeLabel')}
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {subtypeOptions.map((opt) => {
              const active = subtype === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setSubtype(opt.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? tokens.accent.dashboard : borderColor,
                    backgroundColor: active ? tokens.accent.dashboard + '14' : 'transparent',
                  }}
                >
                  <Text
                    className="font-sans-medium text-xs"
                    style={{ color: active ? tokens.accent.dashboard : fgColor }}
                  >
                    {t(`accounts:subtypes.${opt.key}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TextField
          label={t('onboarding:account.balanceLabel')}
          value={balanceText}
          onChangeText={(text) => setBalanceText(formatAmountInput(text, lang))}
          placeholder={t('onboarding:account.balancePlaceholder')}
          keyboardType="numeric"
        />
      </View>
    </OnboardingShell>
  );
}
