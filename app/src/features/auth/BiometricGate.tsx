import { useSegments } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint, LogOut } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';

import { signOut } from '@/services/firebase';
import { useIsAuthed, useUserDoc } from '@/stores/authStore';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';

/**
 * Biometric app-open gate (v3 phase A — 4).
 *
 * When the user has flipped Settings → Security → Biometric on AND the
 * device has enrolled biometric hardware (FaceID / Touch ID / Android
 * BiometricPrompt), require a successful auth before rendering the
 * children. Unlocked state persists for the lifetime of this component
 * (i.e., until cold start) — no re-lock on backgrounding in v3 phase A.
 *
 * The gate short-circuits to render-children on:
 *   - web (no biometric hardware)
 *   - the user being signed-out (nothing to gate)
 *   - the user being inside an (auth) or (onboarding) flow (we'd
 *     otherwise double-prompt: once when isAuthed flips to true on
 *     the sign-in screen, then again when AuthGate's <Redirect> to
 *     /(tabs) unmounts + remounts BiometricGate fresh, resetting
 *     autoPromptedRef. Wait for the user to land on a real auth-
 *     required route before firing the prompt.)
 *   - the userDoc still loading (so we don't prompt before AuthGate has
 *     decided whether the user is even past sign-in)
 *   - biometricEnabled === false in the user doc
 *   - device having no biometric hardware OR no enrolled credentials
 *     (defensive — Settings shouldn't allow flipping the toggle on
 *     in those cases, but cold-startup state may differ)
 *
 * Compose order in `_layout.tsx`: BiometricGate sits INSIDE AuthGate
 * (because gating only makes sense once we know there's an authed
 * user) and OUTSIDE StackTree (so the lock screen is allowed to
 * shadow the entire route stack).
 */
export function BiometricGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation(['settings', 'common']);
  const isAuthed = useIsAuthed();
  const userDoc = useUserDoc();
  const enabled = userDoc?.biometricEnabled === true;
  // Skip the prompt while the user is still inside the auth or
  // onboarding flow. Without this, when isAuthed flips to true on the
  // sign-in screen, BiometricGate prompts once, then AuthGate's
  // <Redirect href="/(tabs)" /> unmounts BiometricGate. The remount on
  // /(tabs) resets autoPromptedRef and prompts again — two prompts
  // in a row from the user's perspective.
  const segments = useSegments();
  const inFocusedFlow = segments[0] === '(auth)' || segments[0] === '(onboarding)';

  // Web has no biometric hardware — start unlocked so we never paint
  // the lock screen on browser cold-start. Native starts locked and
  // flips to unlocked after a successful authenticateAsync call.
  const [unlocked, setUnlocked] = useState(Platform.OS === 'web');
  const [attempting, setAttempting] = useState(false);
  const [supportChecked, setSupportChecked] = useState(Platform.OS === 'web');
  const [hasHardware, setHasHardware] = useState(false);
  // Track whether we've already auto-prompted this session. Prevents
  // re-prompting after the user cancels — they're left on the lock
  // screen with the retry button visible.
  const autoPromptedRef = useRef(false);

  // Probe biometric availability once on mount (native only).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (cancelled) return;
        setHasHardware(compatible && enrolled);
      } catch (err) {
        console.warn('[biometric] support probe failed', err);
      } finally {
        if (!cancelled) setSupportChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Decide whether to gate. The `unlocked` state machine only opens
  // when the toggle is on AND the device supports biometric. Any
  // missing condition collapses to unlocked=true so the children
  // always render.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isAuthed) return;
    // Wait until the user has navigated past the (auth) / (onboarding)
    // groups — see the docblock above for why double-prompts otherwise.
    if (inFocusedFlow) return;
    if (!supportChecked) return;
    if (!enabled || !hasHardware) {
      setUnlocked(true);
      return;
    }
    if (unlocked) return;
    if (attempting) return;
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    void prompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, inFocusedFlow, supportChecked, enabled, hasHardware, unlocked, attempting]);

  const prompt = async () => {
    setAttempting(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('settings:biometric.lockScreen.unlock'),
        // Allow the OS to fall back to the device PIN if biometric
        // fails or is unavailable mid-prompt — safer than locking the
        // user out entirely. iOS uses FaceID/TouchID + passcode;
        // Android uses BiometricPrompt + screen lock.
        disableDeviceFallback: false,
        cancelLabel: t('common:actions.cancel'),
      });
      if (result.success) setUnlocked(true);
    } catch (err) {
      console.warn('[biometric] auth failed', err);
    } finally {
      setAttempting(false);
    }
  };

  // Sign-out from the lock screen — escape hatch for a user who
  // physically can't biometric (broken sensor, swap-phone scenario).
  // Signs them out and AuthGate then routes to /sign-in where they
  // can sign back in fresh; the new session won't auto-prompt biometric
  // until they're past sign-in again.
  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.warn('[biometric] sign-out failed', err);
    }
  };

  // Pass through the children (sign-in screen, onboarding, etc.) while
  // the user hasn't entered the protected area yet. The lock screen
  // would otherwise shadow those flows, which is wrong.
  if (inFocusedFlow) return <>{children}</>;
  if (unlocked) return <>{children}</>;

  return <LockScreen onUnlock={prompt} onSignOut={handleSignOut} attempting={attempting} t={t} />;
}

type LockScreenProps = {
  onUnlock: () => void;
  onSignOut: () => void;
  attempting: boolean;
  t: ReturnType<typeof useTranslation>['t'];
};

function LockScreen({ onUnlock, onSignOut, attempting, t }: LockScreenProps) {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const accent = tokens.accent.dashboard;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: overlayBg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View
        style={{
          width: 80, height: 80, borderRadius: 20,
          backgroundColor: accent + '22',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <Fingerprint size={40} color={accent} strokeWidth={2.2} />
      </View>
      <Text
        className="font-sans-bold text-2xl text-center"
        style={{ color: fgColor }}
      >
        {t('settings:biometric.lockScreen.title')}
      </Text>
      <Text
        className="font-sans text-sm text-center mt-3 mb-8"
        style={{ color: mutedColor, lineHeight: 20, maxWidth: 320 }}
      >
        {t('settings:biometric.lockScreen.body')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings:biometric.lockScreen.unlock')}
        accessibilityState={{ disabled: attempting }}
        onPress={onUnlock}
        disabled={attempting}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 22,
          paddingVertical: 13,
          borderRadius: 12,
          backgroundColor: accent,
          minHeight: 48,
          opacity: attempting ? 0.5 : 1,
        }}
      >
        <Fingerprint size={18} color="#fff" />
        <Text className="font-sans-medium text-white">
          {attempting
            ? t('settings:biometric.lockScreen.unlocking')
            : t('settings:biometric.lockScreen.unlock')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings:biometric.lockScreen.signOut')}
        onPress={onSignOut}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 10,
          marginTop: 16,
          borderRadius: 10,
          borderWidth: 1,
          borderColor,
          minHeight: 40,
        }}
      >
        <LogOut size={14} color={mutedColor} />
        <Text className="font-sans-medium text-sm" style={{ color: mutedColor }}>
          {t('settings:biometric.lockScreen.signOut')}
        </Text>
      </Pressable>
    </View>
  );
}
