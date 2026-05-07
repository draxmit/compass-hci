import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { updateUserDoc } from '@/services/firebase';
import { useAuthStore } from '@/stores/authStore';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';

/**
 * Step 1 — "What are you saving for?"
 *
 * Free-text field; whatever the user types is stored on
 * `users.primaryGoal` and surfaced as the Dashboard goal pill. Skip is
 * fine — the pill just hides if the goal is null/empty.
 */
export default function WelcomeStep() {
  const { t } = useTranslation(['onboarding']);
  const router = useRouter();
  const appAlert = useAppAlert();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);

  const handleNext = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const trimmed = goal.trim();
      const uid = useAuthStore.getState().uid;
      if (uid) {
        await updateUserDoc(uid, { primaryGoal: trimmed.length > 0 ? trimmed : null });
      }
      router.push('/(onboarding)/budget-style');
    } catch (err) {
      console.warn('[onboarding] welcome save failed', err);
      appAlert(t('onboarding:welcome.title'), t('onboarding:errors.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell
      step={1}
      title={t('onboarding:welcome.title')}
      body={t('onboarding:welcome.body')}
      onPrimary={handleNext}
      primaryBusy={busy}
    >
      <View>
        <TextField
          label={t('onboarding:welcome.fieldLabel')}
          value={goal}
          onChangeText={setGoal}
          placeholder={t('onboarding:welcome.fieldPlaceholder')}
          autoCapitalize="sentences"
          returnKeyType="next"
          onSubmitEditing={handleNext}
        />
        <Text className="font-sans text-xs mt-2" style={{ color: mutedColor }}>
          {t('onboarding:welcome.fieldHint')}
        </Text>
      </View>
    </OnboardingShell>
  );
}
