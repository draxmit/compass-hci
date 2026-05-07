import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, View } from 'react-native';

import { updateUserDoc } from '@/services/firebase';
import { useAuthStore } from '@/stores/authStore';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';

type StyleKey = 'monthlyLimit' | 'envelope' | 'fiftyThirtyTwenty';

const STYLES: { readonly key: StyleKey; readonly enabled: boolean }[] = [
  { key: 'monthlyLimit',     enabled: true  },
  { key: 'envelope',         enabled: false },
  { key: 'fiftyThirtyTwenty', enabled: false },
];

/**
 * Step 2 — Pick budget style. v1 only `monthlyLimit` is selectable; the
 * other two are visible-but-disabled so the user knows what's coming.
 *
 * Per ADR-11 §8: large segmented cards stacked vertically, each with
 * title + sub-hint copy. Tap selects (or shows alert for greyed cards).
 * Default selection is `monthlyLimit` so Skip / Next are always valid.
 */
export default function BudgetStyleStep() {
  const { t } = useTranslation(['onboarding']);
  const router = useRouter();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const [selected, setSelected] = useState<StyleKey>('monthlyLimit');
  const [busy, setBusy] = useState(false);

  const handleStylePress = (key: StyleKey, enabled: boolean) => {
    if (enabled) {
      setSelected(key);
      return;
    }
    Alert.alert(
      t(`onboarding:budgetStyle.${key}`),
      t('onboarding:budgetStyle.comingSoonNote'),
    );
  };

  const handleNext = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uid = useAuthStore.getState().uid;
      if (uid) {
        // v1 always writes monthly_limit (the only selectable option).
        // The state variable is decorative until v2 unlocks the other
        // two — kept in case we want to log analytics on which option
        // the user gravitated to.
        await updateUserDoc(uid, { budgetStyle: 'monthly_limit' });
      }
      router.push('/(onboarding)/account');
    } catch (err) {
      console.warn('[onboarding] budget-style save failed', err);
      Alert.alert(t('onboarding:budgetStyle.title'), t('onboarding:errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell
      step={2}
      title={t('onboarding:budgetStyle.title')}
      body={t('onboarding:budgetStyle.body')}
      onPrimary={handleNext}
      primaryBusy={busy}
    >
      <View style={{ gap: 12 }}>
        {STYLES.map(({ key, enabled }) => {
          const active = enabled && selected === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: !enabled }}
              onPress={() => handleStylePress(key, enabled)}
              style={{
                borderWidth: 1,
                borderColor: active ? tokens.accent.dashboard : borderColor,
                borderRadius: 12,
                padding: 16,
                backgroundColor: active ? tokens.accent.dashboard + '14' : 'transparent',
                opacity: enabled ? 1 : 0.55,
              }}
            >
              <View className="flex-row items-center justify-between">
                <Text className="font-sans-semibold text-base" style={{ color: fgColor }}>
                  {t(`onboarding:budgetStyle.${key}`)}
                </Text>
                {active ? (
                  <View
                    style={{
                      width: 22, height: 22, borderRadius: 11,
                      backgroundColor: tokens.accent.dashboard,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Check size={14} color="#fff" strokeWidth={3} />
                  </View>
                ) : !enabled ? (
                  <Text
                    className="font-sans-medium text-xs"
                    style={{
                      color: mutedColor,
                      backgroundColor: borderColor,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    {t('onboarding:budgetStyle.comingSoonNote')}
                  </Text>
                ) : null}
              </View>
              <Text
                className="font-sans text-sm mt-1.5"
                style={{ color: mutedColor, lineHeight: 20 }}
              >
                {t(`onboarding:budgetStyle.${key}Hint`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </OnboardingShell>
  );
}
