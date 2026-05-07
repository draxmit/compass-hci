import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { updateUserDoc } from '@/services/firebase';
import { useAuthStore } from '@/stores/authStore';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';

/**
 * Layout shell shared by every step of the onboarding wizard. Per ADR-11:
 *  - Step counter top-left ("Step N of 4"), back chevron next to it for
 *    steps 2-4 (step 1 has no back since it's the first).
 *  - Title + body copy at the top of the content area.
 *  - Caller provides `children` for the step-specific form / inputs.
 *  - Bottom row: Skip (text link, left) + Next/Done (primary button, right).
 *    Skip wires straight to `finishOnboarding()` here — sets
 *    `users.onboardingComplete = true` and navigates to `/`. Caller's
 *    `onNext` runs whatever step-specific persistence is needed and
 *    typically calls a `router.push` / `router.replace` to advance.
 *
 * Skip semantics (per ADR-11 §3): exits the whole wizard, not just the
 * current step. Anything saved on previous steps stays.
 */

export type OnboardingShellProps = {
  /** 1-indexed step number, used for "Step N of TOTAL" + the back-chevron visibility. */
  step: 1 | 2 | 3 | 4;
  title: string;
  body: string;
  children: ReactNode;
  /** Label for the primary button. Defaults to t('onboarding:actions.next'). */
  primaryLabel?: string;
  /** Disable the primary button (e.g. while saving). */
  primaryDisabled?: boolean;
  /** True while the user's tap is being processed — replaces label with a saving spinner copy. */
  primaryBusy?: boolean;
  /** Hide the Skip link entirely (e.g. when the step is required). v1 doesn't use this. */
  hideSkip?: boolean;
  /** Step-specific Next handler. Throws → caller's responsibility to surface errors. */
  onPrimary: () => void | Promise<void>;
};

const TOTAL_STEPS = 4 as const;

export function OnboardingShell({
  step, title, body, children,
  primaryLabel, primaryDisabled, primaryBusy, hideSkip, onPrimary,
}: OnboardingShellProps) {
  const { t } = useTranslation(['onboarding', 'common']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];

  const [skipping, setSkipping] = useState(false);

  const goBack = () => {
    if (step > 1 && router.canGoBack()) router.back();
  };

  const handleSkip = async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      await finishOnboarding();
      router.replace('/');
    } catch (err) {
      console.warn('[onboarding] skip failed', err);
      Alert.alert(t('onboarding:actions.skip'), t('onboarding:errors.saveFailed'));
      setSkipping(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingTop: 48 + insets.top * 0.4,
          paddingBottom: 24 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="self-center w-full max-w-md lg:max-w-2xl">
          {/* Top row — back chevron (steps 2+) + step counter */}
          <View className="flex-row items-center mb-8" style={{ gap: 8 }}>
            {step > 1 ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('common:actions.back')}
                onPress={goBack}
                hitSlop={8}
                className="-ml-2 p-2 min-h-[36px]"
              >
                <ChevronLeft size={22} color={fgColor} />
              </Pressable>
            ) : null}
            <Text className="font-sans-medium text-xs uppercase tracking-wider" style={{ color: mutedColor }}>
              {t('onboarding:steps.stepOf', { current: step, total: TOTAL_STEPS })}
            </Text>
          </View>

          <Text className="font-sans-bold text-3xl mb-2" style={{ color: fgColor }}>
            {title}
          </Text>
          <Text
            className="font-sans text-base mb-8"
            style={{ color: mutedColor, lineHeight: 24 }}
          >
            {body}
          </Text>

          {children}

          {/* Bottom action row — sits below the form content with breathing room. */}
          <View
            className="flex-row items-center justify-between mt-8"
            style={{ gap: 12 }}
          >
            {!hideSkip ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('onboarding:actions.skip')}
                onPress={handleSkip}
                disabled={skipping}
                hitSlop={8}
                style={{ paddingVertical: 12, paddingHorizontal: 4, minHeight: 44, opacity: skipping ? 0.5 : 1 }}
              >
                <Text className="font-sans-medium text-sm" style={{ color: mutedColor }}>
                  {t('onboarding:actions.skip')}
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primaryLabel ?? t('onboarding:actions.next')}
              accessibilityState={{ disabled: primaryDisabled || primaryBusy }}
              onPress={() => {
                if (primaryDisabled || primaryBusy) return;
                void onPrimary();
              }}
              disabled={primaryDisabled || primaryBusy}
              style={{
                flexShrink: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingHorizontal: 22,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: tokens.accent.dashboard,
                minHeight: 44,
                opacity: primaryDisabled || primaryBusy ? 0.5 : 1,
              }}
            >
              <Text className="font-sans-medium text-white text-sm">
                {primaryBusy
                  ? t('onboarding:actions.saving')
                  : primaryLabel ?? t('onboarding:actions.next')}
              </Text>
            </Pressable>
          </View>

          {/* Hairline above the action row for the desktop view to feel
              grounded — invisible on mobile if the content already fills. */}
          <View
            style={{
              height: 0,
              borderBottomWidth: 1,
              borderBottomColor: borderColor,
              marginTop: 24,
              opacity: 0,
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Common exit path — used by Skip on every step and by the final step's
 * Done button. Sets `users.onboardingComplete = true` so AuthGate stops
 * redirecting back to the wizard. Doesn't navigate; caller handles that.
 */
export async function finishOnboarding(): Promise<void> {
  const uid = useAuthStore.getState().uid;
  if (!uid) throw new Error('finishOnboarding: not signed in');
  await updateUserDoc(uid, { onboardingComplete: true });
}
