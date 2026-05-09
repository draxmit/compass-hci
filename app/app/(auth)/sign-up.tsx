import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { signUpWithEmailPassword, useGoogleSignIn } from '@/services/firebase';
import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { tokens } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';

export default function SignUpScreen() {
  const { t } = useTranslation(['auth']);
  const { color: accent } = usePageAccent();
  const { promptAsync: googlePromptAsync, isPending: isGooglePending } = useGoogleSignIn();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!displayName.trim()) {
      setError(t('auth:validation.missingDisplayName'));
      return;
    }
    if (!email.trim() || !password) {
      setError(t('auth:validation.missingEmailOrPassword'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth:validation.passwordTooShort'));
      return;
    }
    setIsSubmitting(true);
    try {
      await signUpWithEmailPassword(email.trim(), password, displayName.trim());
      // Auth state propagates → AuthGate redirects to (tabs).
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth:errors.signUpFailed');
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Google sign-in works on web (signInWithPopup) AND on native via the
  // EAS dev client APK + Android OAuth Client ID configured in
  // .env.local — see sign-in.tsx for the full note.
  const onGoogle = async () => {
    setError(null);
    const result = await googlePromptAsync();
    if (result.type === 'error') setError(result.message);
  };

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* No Card wrapper — flat content reads as the app's first surface
          rather than a quirky boxed widget. Matches sign-in.tsx. */}
      <View className="w-full max-w-md">
        <View className="items-center mb-8">
          <Logo size={48} color={accent} />
        </View>
        <Text className="font-sans-bold text-3xl text-center mb-2">{t('auth:signUp.title')}</Text>
        <Text className="text-center text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-10">
          {t('auth:signUp.tagline')}
        </Text>

        <View className="gap-4">
          <TextField
            label={t('auth:fields.displayName')}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t('auth:fields.displayNamePlaceholder')}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
          />
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
            placeholder={t('auth:fields.passwordPlaceholderMin')}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          {error ? (
            <Text className="text-sm" style={{ color: tokens.semantic.danger }}>
              {error}
            </Text>
          ) : null}

          <Button onPress={onSubmit} isPending={isSubmitting}>
            {isSubmitting ? t('auth:signUp.submitting') : t('auth:signUp.submit')}
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
            {t('auth:signUp.haveAccount')}
          </Text>
          <Link href={'/(auth)/sign-in' as Href} replace asChild>
            <Text
              className="font-sans-semibold text-sm"
              style={{ color: accent }}
              accessibilityRole="link"
            >
              {t('auth:signUp.signInLink')}
            </Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}
