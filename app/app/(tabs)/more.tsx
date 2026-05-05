import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lightbulb, ChevronRight, LogOut } from 'lucide-react-native';
import { useState } from 'react';

import { signOut } from '@/services/firebase';
import { useAuthUser } from '@/stores/authStore';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import type { ThemeMode } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';
import { useIsDesktop } from '@/shared/hooks/useBreakpoint';

// TODO(T11): full settings (language toggle, biometric, account deletion).
export default function MoreScreen() {
  const { mode, setMode, resolvedScheme } = useTheme();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const user = useAuthUser();
  const [signingOut, setSigningOut] = useState(false);
  const isDark = resolvedScheme === 'dark';

  const buttons: { label: string; value: ThemeMode }[] = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'System', value: 'system' },
  ];

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      // AuthGate redirects to (auth)/sign-in once auth state propagates.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign out failed.';
      Alert.alert('Sign out failed', msg);
      setSigningOut(false);
    }
  };

  const mutedColor = isDark
    ? tokens.surface['dark-fg-muted']
    : tokens.surface['light-fg-muted'];

  return (
    <View className="flex-1 px-6 pt-12">
      <Text className="font-sans-bold text-3xl mb-1">More</Text>
      <Text className="font-sans text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-8">
        Settings — full version in T11.
      </Text>

      {/* Account info */}
      {user?.email ? (
        <Card padding="lg" className="mb-4 w-full max-w-md">
          <Text className="font-sans-semibold text-base mb-1">Signed in as</Text>
          <Text
            className="font-sans text-sm"
            style={{ color: mutedColor }}
            numberOfLines={1}
          >
            {user.displayName ? `${user.displayName} · ` : ''}
            {user.email}
          </Text>
        </Card>
      ) : null}

      {/* Theme picker */}
      <Card padding="lg" className="mb-4 w-full max-w-md">
        <Text className="font-sans-semibold text-base mb-4">Theme</Text>
        <View className="flex-row gap-2">
          {buttons.map((b) => {
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

      {/* Insights link — moved out of bottom tabs in ADR-02 */}
      {!isDesktop && (
        <Card padding="none" className="mb-4 w-full max-w-md">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open Insights"
            onPress={() => router.push('/insights')}
            className="flex-row items-center px-5 py-4 min-h-[44px]"
          >
            <Lightbulb size={20} color={tokens.accent.insights} />
            <Text className="font-sans-medium ml-3 flex-1">Insights</Text>
            <ChevronRight size={18} color={mutedColor} />
          </Pressable>
        </Card>
      )}

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
    </View>
  );
}
