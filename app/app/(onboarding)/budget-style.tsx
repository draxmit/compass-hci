import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { updateUserDoc } from '@/services/firebase';
import { useAuthStore } from '@/stores/authStore';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Text } from '@/shared/ui/Text';

type StyleKey = 'monthlyLimit' | 'envelope' | 'fiftyThirtyTwenty';

// All three styles shipped (ADR-21).
const STYLES: readonly StyleKey[] = ['monthlyLimit', 'envelope', 'fiftyThirtyTwenty'];

const STYLE_KEY_TO_DOC: Record<StyleKey, 'monthly_limit' | 'envelope' | 'fifty_thirty_twenty'> = {
  monthlyLimit: 'monthly_limit',
  envelope: 'envelope',
  fiftyThirtyTwenty: 'fifty_thirty_twenty',
};

/**
 * Step 2 — Pick budget style. All three styles selectable; user choice
 * persisted to userDoc.budgetStyle and read back by /budgets to render
 * the matching view.
 *
 * Per ADR-11 §8: large segmented cards stacked vertically, each with
 * title + sub-hint copy. Default selection is `monthlyLimit` so Skip /
 * Next are always valid.
 */
export default function BudgetStyleStep() {
  const { t } = useTranslation(['onboarding']);
  const router = useRouter();
  const appAlert = useAppAlert();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const [selected, setSelected] = useState<StyleKey>('monthlyLimit');
  const [busy, setBusy] = useState(false);

  const handleNext = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uid = useAuthStore.getState().uid;
      if (uid) {
        // Persists the user's selection to the userDoc; /budgets reads
        // it back and renders the matching view.
        await updateUserDoc(uid, { budgetStyle: STYLE_KEY_TO_DOC[selected] });
      }
      router.push('/(onboarding)/account');
    } catch (err) {
      console.warn('[onboarding] budget-style save failed', err);
      appAlert(t('onboarding:budgetStyle.title'), t('onboarding:errors.saveFailed'));
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
        {STYLES.map((key) => {
          const active = selected === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setSelected(key)}
              style={{
                borderWidth: 1,
                borderColor: active ? tokens.accent.dashboard : borderColor,
                borderRadius: 12,
                padding: 16,
                backgroundColor: active ? tokens.accent.dashboard + '14' : 'transparent',
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
