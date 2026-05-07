import type { FirebaseError } from 'firebase/app';
import { useRouter } from 'expo-router';
import { ChevronLeft, LogOut, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteUserAccount, signOut, updateUserDoc } from '@/services/firebase';
import { i18next, persistLocale } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import type { ThemeMode } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';
import { getFlag, setFlag } from '@/shared/utils/secureFlags';
import { useAuthStore, useUserDoc } from '@/stores/authStore';

/**
 * /settings — config + security + account. Three groups separated by
 * uppercase section labels (per ADR-12 §7):
 *
 *   Preferences  → theme + language
 *   Security     → biometric + encrypted-cache toggles (v1 stores flags
 *                  only; enforcement is v3)
 *   Account      → sign-out + delete-account (danger styled)
 *
 * Reached from /profile or via the Sidebar footer on desktop.
 */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const { mode, setMode, resolvedScheme } = useTheme();
  const router = useRouter();
  const appAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const userDoc = useUserDoc();
  const isDark = resolvedScheme === 'dark';

  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeLocale, setActiveLocale] = useState<Locale>(
    (i18n.language as Locale) === 'en' ? 'en' : 'id',
  );
  // Encrypted-cache flag is per-device → SecureStore. Read on mount;
  // updates flow through `setFlag` and the local state in parallel so the
  // Switch flips immediately rather than waiting for an async re-fetch.
  const [encryptedCache, setEncryptedCache] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    void getFlag('compass.encryptedCache.enabled').then((v) => {
      if (!cancelled) setEncryptedCache(v);
    });
    return () => { cancelled = true; };
  }, []);

  // Biometric flag is on the user doc → useUserDoc keeps it fresh.
  const biometricEnabled = userDoc?.biometricEnabled ?? false;
  const displayInIDR = userDoc?.displayInIDR ?? false;

  const themeButtons: { label: string; value: ThemeMode }[] = [
    { label: t('settings:settings.theme.light'), value: 'light' },
    { label: t('settings:settings.theme.dark'), value: 'dark' },
    { label: t('settings:settings.theme.system'), value: 'system' },
  ];

  const languageButtons: { label: string; value: Locale }[] = [
    { label: t('settings:settings.language.id'), value: 'id' },
    { label: t('settings:settings.language.en'), value: 'en' },
  ];

  const handleSelectLocale = async (next: Locale) => {
    if (next === activeLocale) return;
    setActiveLocale(next);
    await i18next.changeLanguage(next);
    void persistLocale(next);
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings:settings.errors.signOutFallback');
      appAlert(t('settings:settings.errors.signOutTitle'), msg);
      setSigningOut(false);
    }
  };

  const handleToggleBiometric = (next: boolean) => {
    const uid = useAuthStore.getState().uid;
    if (!uid) return;
    // Optimistic — the user-doc subscription will reconcile if the write
    // fails. Switch reads from `userDoc.biometricEnabled` so the next
    // render reflects whatever the doc actually says.
    void updateUserDoc(uid, { biometricEnabled: next }).catch((err: unknown) => {
      console.warn('[settings] biometric flag write failed', err);
    });
  };

  const handleToggleEncryptedCache = (next: boolean) => {
    setEncryptedCache(next);  // optimistic
    void setFlag('compass.encryptedCache.enabled', next);
  };

  const handleToggleDisplayInIDR = (next: boolean) => {
    const uid = useAuthStore.getState().uid;
    if (!uid) return;
    // Same optimistic pattern as biometric — userDoc subscription
    // reconciles. Affects every amount surface (tx rows / account
    // rows / recent strip / report top-5) on the next render.
    void updateUserDoc(uid, { displayInIDR: next }).catch((err: unknown) => {
      console.warn('[settings] displayInIDR flag write failed', err);
    });
  };

  const handleDelete = () => {
    if (deleting) return;
    appAlert(
      t('settings:settings.account.deleteConfirmTitle'),
      t('settings:settings.account.deleteConfirmBody'),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('settings:settings.account.deleteConfirmAction'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteUserAccount();
              // AuthGate redirects to /(auth)/sign-in once auth.currentUser
              // flips to null inside deleteUserAccount.
            } catch (err: unknown) {
              const code = (err as FirebaseError)?.code;
              // Recovery: by the time we got here the Firestore subtree
              // is already wiped (the failure is on the LAST step,
              // deleteUser). The user is signed in to a now-empty
              // workspace which is broken UX. Force sign-out so they
              // land on /sign-in cleanly. They can sign in again with
              // the same email — ensureUserDoc rebuilds the workspace
              // from scratch — or create a new account.
              try {
                await signOut();
              } catch {
                // best-effort; if even sign-out fails the AuthGate
                // still surfaces the next auth state
              }
              if (code === 'auth/requires-recent-login') {
                appAlert(
                  t('settings:settings.account.deleteFailedTitle'),
                  t('settings:settings.account.requiresRecentLoginBody'),
                );
              } else {
                const msg = err instanceof Error ? err.message : '';
                appAlert(t('settings:settings.account.deleteFailedTitle'), msg);
              }
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const mutedColor = isDark
    ? tokens.surface['dark-fg-muted']
    : tokens.surface['light-fg-muted'];
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const sectionLabelClass = 'font-sans-medium text-xs uppercase tracking-wider mb-3 mt-2';

  // Same wrapper pattern as /profile — inline backgroundColor (not NativeWind
  // className) so bg paints synchronously on first frame.
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48, paddingBottom: 24 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="self-center w-full max-w-md lg:max-w-3xl">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('settings:settings.actions.backToProfile')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
            hitSlop={8}
            className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
          >
            <ChevronLeft size={22} color={fgColor} />
            <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
              {t('settings:profile.title')}
            </Text>
          </Pressable>

          <Text className="font-sans-bold text-3xl mb-1">{t('settings:settings.title')}</Text>
          <Text className="font-sans text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-6">
            {t('settings:settings.tagline')}
          </Text>

          {/* ===== PREFERENCES ===== */}
          <Text className={sectionLabelClass} style={{ color: mutedColor }}>
            {t('settings:settings.section.preferences')}
          </Text>

          {/* Theme picker */}
          <Card padding="lg" className="mb-3 w-full">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('settings:settings.section.theme')}
            </Text>
            <View className="flex-row gap-2">
              {themeButtons.map((b) => {
                const active = mode === b.value;
                return (
                  <Pressable
                    key={b.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t('settings:settings.theme.setTo', { label: b.label })}
                    onPress={() => setMode(b.value)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 12,
                      paddingVertical: 12,
                      borderWidth: 1,
                      minHeight: 44,
                      backgroundColor: active ? tokens.accent.dashboard : 'transparent',
                      borderColor: active ? tokens.accent.dashboard : borderColor,
                    }}
                  >
                    <Text
                      className={
                        active
                          ? 'font-sans-medium text-white'
                          : 'font-sans-medium text-surface-light-fg dark:text-surface-dark-fg'
                      }
                    >
                      {b.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Language picker */}
          <Card padding="lg" className="mb-6 w-full">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('settings:settings.section.language')}
            </Text>
            <View className="flex-row gap-2">
              {languageButtons.map((b) => {
                const active = activeLocale === b.value;
                return (
                  <Pressable
                    key={b.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t('settings:settings.language.setTo', { label: b.label })}
                    onPress={() => void handleSelectLocale(b.value)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 12,
                      paddingVertical: 12,
                      borderWidth: 1,
                      minHeight: 44,
                      backgroundColor: active ? tokens.accent.dashboard : 'transparent',
                      borderColor: active ? tokens.accent.dashboard : borderColor,
                    }}
                  >
                    <Text
                      className={
                        active
                          ? 'font-sans-medium text-white'
                          : 'font-sans-medium text-surface-light-fg dark:text-surface-dark-fg'
                      }
                    >
                      {b.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Display in IDR toggle (ADR-19 / multi-currency v2). When
              on, every amount surface renders the IDR-converted value
              as the primary line + native amount as a muted subtitle.
              Default off → native-only. Cross-account aggregations
              (Net Worth, monthly totals) always sum in IDR regardless. */}
          <Card padding="lg" className="mb-6 w-full">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text
                  className="font-sans-medium text-sm"
                  style={{ color: fgColor }}
                >
                  {t('settings:settings.display.idrLabel')}
                </Text>
                <Text
                  className="font-sans text-xs mt-1"
                  style={{ color: mutedColor }}
                >
                  {t('settings:settings.display.idrHint')}
                </Text>
              </View>
              <Switch
                accessibilityLabel={t('settings:settings.display.idrLabel')}
                value={displayInIDR}
                onValueChange={handleToggleDisplayInIDR}
                trackColor={{
                  false: borderColor,
                  true: tokens.accent.dashboard,
                }}
                thumbColor="#fff"
              />
            </View>
          </Card>

          {/* ===== SECURITY ===== */}
          <Text className={sectionLabelClass} style={{ color: mutedColor }}>
            {t('settings:settings.section.security')}
          </Text>
          <Card padding="none" className="mb-6 w-full">
            {/* Biometric toggle — wired live in v3 phase A. The flag is
                read by BiometricGate at app cold-start. The 'Coming
                in v3' pill is dropped now that the feature ships;
                encryptedCache below still carries it (deferred to v3.5). */}
            <SecurityRow
              label={t('settings:settings.security.biometricLabel')}
              hint={t('settings:settings.security.biometricHint')}
              value={biometricEnabled}
              onValueChange={handleToggleBiometric}
              isDark={isDark}
              fgColor={fgColor}
              mutedColor={mutedColor}
              borderColor={borderColor}
              showDivider={false}
            />
            <SecurityRow
              label={t('settings:settings.security.encryptedCacheLabel')}
              hint={t('settings:settings.security.encryptedCacheHint')}
              comingSoon={t('settings:settings.security.comingInV3')}
              value={encryptedCache}
              onValueChange={handleToggleEncryptedCache}
              isDark={isDark}
              fgColor={fgColor}
              mutedColor={mutedColor}
              borderColor={borderColor}
              showDivider
            />
          </Card>

          {/* ===== ACCOUNT ===== */}
          <Text className={sectionLabelClass} style={{ color: mutedColor }}>
            {t('settings:settings.section.account')}
          </Text>
          <Card padding="none" className="w-full">
            {/* Sign out */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings:settings.signOut')}
              accessibilityState={{ disabled: signingOut }}
              disabled={signingOut}
              onPress={handleSignOut}
              className="flex-row items-center px-5 py-4 min-h-[44px]"
              style={{ opacity: signingOut ? 0.5 : 1 }}
            >
              <LogOut size={20} color={fgColor} />
              <Text className="font-sans-medium ml-3 flex-1" style={{ color: fgColor }}>
                {signingOut ? t('settings:settings.signingOut') : t('settings:settings.signOut')}
              </Text>
            </Pressable>
            {/* Delete account — danger row */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('settings:settings.account.deleteLabel')}
              accessibilityState={{ disabled: deleting }}
              disabled={deleting}
              onPress={handleDelete}
              className="px-5 py-4 min-h-[44px]"
              style={{
                opacity: deleting ? 0.5 : 1,
                borderTopWidth: 1,
                borderTopColor: borderColor,
              }}
            >
              <View className="flex-row items-center">
                <Trash2 size={20} color={tokens.semantic.danger} />
                <Text className="font-sans-medium ml-3 flex-1" style={{ color: tokens.semantic.danger }}>
                  {deleting
                    ? t('settings:settings.account.deleting')
                    : t('settings:settings.account.deleteLabel')}
                </Text>
              </View>
              <Text className="font-sans text-xs mt-1.5 ml-8" style={{ color: mutedColor }}>
                {t('settings:settings.account.deleteHelp')}
              </Text>
            </Pressable>
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

// ---------- SecurityRow ----------

type SecurityRowProps = {
  label: string;
  hint: string;
  /** Optional 'Coming in v3' / 'Coming in v3.5' style pill. Omit when the
      feature is live (e.g., biometric is fully wired in v3 phase A). */
  comingSoon?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  isDark: boolean;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  showDivider: boolean;
};

function SecurityRow({
  label, hint, comingSoon, value, onValueChange,
  isDark, fgColor, mutedColor, borderColor, showDivider,
}: SecurityRowProps) {
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: borderColor,
      }}
    >
      <View className="flex-row items-center" style={{ gap: 12 }}>
        <View className="flex-1">
          <View className="flex-row items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
              {label}
            </Text>
            {comingSoon ? (
              <Text
                className="font-sans-medium text-[10px]"
                style={{
                  color: mutedColor,
                  backgroundColor: borderColor,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                {comingSoon}
              </Text>
            ) : null}
          </View>
          <Text className="font-sans text-xs mt-1" style={{ color: mutedColor }}>
            {hint}
          </Text>
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{
            false: borderColor,
            true: tokens.accent.dashboard,
          }}
          // Android: explicit thumb color so it reads white on the active
          // track. iOS draws its own thumb correctly without override.
          thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
          ios_backgroundColor={borderColor}
        />
      </View>
    </View>
  );
}
