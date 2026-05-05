import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, LogOut, Tag } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { signOut } from '@/services/firebase';
import { i18next, persistLocale } from '@/shared/i18n';
import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import type { ThemeMode } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// /settings is a config screen — slim and config-only. Profile/identity
// lives at /profile. Reached from a link in /profile, or via Settings
// footer on desktop sidebar.
//
// TODO(T11): biometric toggle, account deletion, encrypted cache toggle.
export default function SettingsScreen() {
  const { t, i18n } = useTranslation(['settings', 'common', 'categories']);
  const { mode, setMode, resolvedScheme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [signingOut, setSigningOut] = useState(false);
  const [activeLocale, setActiveLocale] = useState<Locale>(
    (i18n.language as Locale) === 'en' ? 'en' : 'id',
  );
  const isDark = resolvedScheme === 'dark';

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
      Alert.alert(t('settings:settings.errors.signOutTitle'), msg);
      setSigningOut(false);
    }
  };

  const mutedColor = isDark
    ? tokens.surface['dark-fg-muted']
    : tokens.surface['light-fg-muted'];
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const sectionLabelClass = 'font-sans-medium text-xs uppercase tracking-wider mb-3';

  // Same wrapper pattern as /profile — inline backgroundColor (not NativeWind
  // className) so bg paints synchronously on first frame. Bottom inset keeps
  // Sign out clear of the Android system nav bar.
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48, paddingBottom: 24 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="self-center w-full max-w-md">
        {/* Back-to-Profile link visible on all platforms — Settings is always
            a sub-route of /profile so the back action is unambiguous. */}
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
        <Text className="font-sans text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-8">
          {t('settings:settings.tagline')}
        </Text>

      {/* Theme picker */}
      <Card padding="lg" className="mb-4 w-full max-w-md">
        <Text className={sectionLabelClass} style={{ color: mutedColor }}>
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
                  borderColor: active
                    ? tokens.accent.dashboard
                    : isDark
                      ? tokens.surface['dark-border']
                      : tokens.surface['light-border'],
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
      <Card padding="lg" className="mb-4 w-full max-w-md">
        <Text className={sectionLabelClass} style={{ color: mutedColor }}>
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
                  borderColor: active
                    ? tokens.accent.dashboard
                    : isDark
                      ? tokens.surface['dark-border']
                      : tokens.surface['light-border'],
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

      {/* Categories link */}
      <Card padding="none" className="mb-4 w-full max-w-md">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('categories:title')}
          onPress={() => router.push('/categories')}
          className="flex-row items-center px-5 py-4 min-h-[44px]"
        >
          <Tag size={20} color={mutedColor} />
          <View className="ml-3 flex-1">
            <Text className="font-sans-medium">{t('categories:title')}</Text>
            <Text className="font-sans text-xs" style={{ color: mutedColor }}>
              {t('categories:tagline')}
            </Text>
          </View>
          <ChevronRight size={18} color={mutedColor} />
        </Pressable>
      </Card>

      {/* Sign out */}
      <Card padding="none" className="w-full max-w-md">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings:settings.signOut')}
          accessibilityState={{ disabled: signingOut }}
          disabled={signingOut}
          onPress={handleSignOut}
          className="flex-row items-center px-5 py-4 min-h-[44px]"
          style={{ opacity: signingOut ? 0.5 : 1 }}
        >
          <LogOut size={20} color={tokens.semantic.danger} />
          <Text
            className="font-sans-medium ml-3 flex-1"
            style={{ color: tokens.semantic.danger }}
          >
            {signingOut ? t('settings:settings.signingOut') : t('settings:settings.signOut')}
          </Text>
        </Pressable>
      </Card>
        </View>
      </ScrollView>
    </View>
  );
}
