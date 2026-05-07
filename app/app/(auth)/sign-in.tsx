import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signInWithEmailPassword, useGoogleSignIn } from '@/services/firebase';
import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { tokens } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';

export default function SignInScreen() {
  const { t } = useTranslation(['auth']);
  const { color: accent } = usePageAccent();
  const { promptAsync: googlePromptAsync, isPending: isGooglePending } = useGoogleSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError(t('auth:validation.missingEmailOrPassword'));
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithEmailPassword(email.trim(), password);
      // AuthGate redirects to (tabs) once auth state propagates.
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth:errors.signInFailed');
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Expo Go can't authorize the LAN redirect URI used by expo-auth-session, so
  // Google sign-in only works on web until we ship an EAS dev client. The
  // button stays visible to keep the layout stable across builds — tapping it
  // on native explains the gap rather than silently failing.
  const onGoogle = async () => {
    setError(null);
    if (Platform.OS !== 'web') {
      Alert.alert(t('auth:googleAndroid.title'), t('auth:googleAndroid.signInBody'));
      return;
    }
    const result = await googlePromptAsync();
    if (result.type === 'error') setError(result.message);
    // 'dismiss' is silent — user backed out intentionally.
  };

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* No Card wrapper — auth surface reads cleaner as flat content on
          the page surface. Card was making it feel like a quirky widget
          instead of the app's home screen for first-runs. */}
      <View className="w-full max-w-md">
        <View className="items-center mb-8">
          <Logo size={48} color={accent} />
        </View>
        <Text className="font-sans-bold text-3xl text-center mb-2">{t('auth:signIn.title')}</Text>
        <Text className="text-center text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-10">
          {t('auth:signIn.tagline')}
        </Text>

        <View className="gap-4">
          <TextField
            label={t('auth:fields.email')}
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth:fields.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <TextField
            label={t('auth:fields.password')}
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth:fields.passwordPlaceholder')}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          <View className="items-end">
            {/* Typed routes regenerate on `expo start`; cast keeps tsc green
                until then. Route file exists at app/app/(auth)/forgot-password.tsx. */}
            <Link href={'/(auth)/forgot-password' as Href} replace asChild>
              <Text
                className="font-sans-medium text-sm"
                style={{ color: accent }}
                accessibilityRole="link"
              >
                {t('auth:fields.forgotPasswordLink')}
              </Text>
            </Link>
          </View>

          {error ? (
            <Text className="text-sm" style={{ color: tokens.semantic.danger }}>
              {error}
            </Text>
          ) : null}

          <Button onPress={onSubmit} isPending={isSubmitting}>
            {isSubmitting ? t('auth:signIn.submitting') : t('auth:signIn.submit')}
          </Button>
        </View>

        <View className="flex-row items-center my-6">
          <View className="flex-1 h-px bg-surface-light-border dark:bg-surface-dark-border" />
          <Text className="px-3 text-xs uppercase tracking-wider text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
            {t('common:or', { defaultValue: 'or' })}
          </Text>
          <View className="flex-1 h-px bg-surface-light-border dark:bg-surface-dark-border" />
        </View>

        <Button variant="secondary" onPress={onGoogle} isPending={isGooglePending}>
          {t('auth:signIn.googleButton')}
        </Button>

        <View className="flex-row justify-center mt-8 gap-1">
          <Text className="text-sm text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
            {t('auth:signIn.noAccount')}
          </Text>
          <Link href={'/(auth)/sign-up' as Href} replace asChild>
            <Text
              className="font-sans-semibold text-sm"
              style={{ color: accent }}
              accessibilityRole="link"
            >
              {t('auth:signIn.createAccount')}
            </Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}
