import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, LogOut } from 'lucide-react-native';
import { useState } from 'react';

import { signOut } from '@/services/firebase';
import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import type { ThemeMode } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';

// /settings is a config screen — slim and config-only. Profile/identity
// lives at /profile. Reached from a link in /profile, or via Settings
// footer on desktop sidebar.
//
// TODO(T11): language toggle, biometric toggle, account deletion, encrypted
// cache toggle.
export default function SettingsScreen() {
  const { mode, setMode, resolvedScheme } = useTheme();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [signingOut, setSigningOut] = useState(false);
  const isDark = resolvedScheme === 'dark';

  const themeButtons: { label: string; value: ThemeMode }[] = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'System', value: 'system' },
  ];

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign out failed.';
      Alert.alert('Sign out failed', msg);
      setSigningOut(false);
    }
  };

  const mutedColor = isDark
    ? tokens.surface['dark-fg-muted']
    : tokens.surface['light-fg-muted'];
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const sectionLabelClass = 'font-sans-medium text-xs uppercase tracking-wider mb-3';

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {!isDesktop && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          hitSlop={8}
          className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
        >
          <ChevronLeft size={22} color={fgColor} />
          <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
            Back
          </Text>
        </Pressable>
      )}

      <Text className="font-sans-bold text-3xl mb-1">Settings</Text>
      <Text className="font-sans text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-8">
        Theme, sign out — full version in T11.
      </Text>

      {/* Theme picker */}
      <Card padding="lg" className="mb-4 w-full max-w-md">
        <Text className={sectionLabelClass} style={{ color: mutedColor }}>
          Theme
        </Text>
        <View className="flex-row gap-2">
          {themeButtons.map((b) => {
            const active = mode === b.value;
            return (
              <Pressable
                key={b.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Set theme to ${b.label}`}
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

      {/* Sign out */}
      <Card padding="none" className="w-full max-w-md">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
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
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}
