import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { updateUserDoc } from '@/services/firebase';
import { createGoal } from '@/services/firestore/goalsService';
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
 * Free-text field. On Next we create a real `Goal` doc with the
 * entered text as its name (target = 0, no date) AND pin it as
 * `users.pinnedGoalId`. This mirrors what `migratePrimaryGoalToPinned`
 * does on legacy sign-ins — doing it eagerly here means the user sees
 * their goal on the Dashboard immediately rather than waiting for a
 * sign-out/sign-in round-trip.
 *
 * `users.primaryGoal` is set to null (matches the migrated state) so
 * the migration helper no-ops on the next sign-in.
 *
 * Skip is fine — both writes are short-circuited if the field is empty.
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
      const { uid } = useAuthStore.getState();
      if (uid && trimmed.length > 0) {
        // Workspace id matches the convention used everywhere else in
        // the app (`solo-${uid}`). Create the Goal first, then pin it
        // — if the create fails, we don't touch the user doc.
        const wid = `solo-${uid}`;
        const goalId = await createGoal(wid, {
          kind: 'sinking_fund',
          name: trimmed,
          targetMinor: 0,
          currentMinor: 0,
          targetDate: null,
          templateKey: null,
        });
        await updateUserDoc(uid, { pinnedGoalId: goalId, primaryGoal: null });
      } else if (uid) {
        // Empty / skipped — clear any previous draft and mark migration
        // as already-done so the auth-time helper bails cleanly.
        await updateUserDoc(uid, { pinnedGoalId: null, primaryGoal: null });
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
