import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { sendPasswordReset } from '@/services/firebase';
import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';

/**
 * Forgot-password screen. Privacy-preserving (ADR-03 §6 + orchestrator
 * decision #2): regardless of whether the email exists in Firebase Auth,
 * the success state is identical and generic. Network errors are silently
 * swallowed too — same UX, no enumeration vector.
 */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation(['auth']);
  const { color: accent } = usePageAccent();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async () => {
    if (!email.trim()) return;
    setIsSubmitting(true);
    try {
      await sendPasswordReset(email.trim());
    } catch {
      // Intentionally silent — see component header.
    } finally {
      setIsSubmitting(false);
      setSubmitted(true);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Flat content — matches sign-in / sign-up. */}
      <View className="w-full max-w-md">
        <View className="items-center mb-8">
          <Logo size={48} color={accent} />
        </View>
        <Text className="font-sans-bold text-3xl text-center mb-2">{t('auth:forgotPassword.title')}</Text>
        <Text className="text-center text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-10">
          {t('auth:forgotPassword.body')}
        </Text>

        {submitted ? (
          <View className="gap-4">
            <Text className="font-sans-semibold text-center">{t('auth:forgotPassword.successTitle')}</Text>
            <Text className="text-center">{t('auth:forgotPassword.successBody')}</Text>
            <Link href={'/(auth)/sign-in' as Href} replace asChild>
              <Button onPress={() => undefined}>{t('auth:forgotPassword.backToSignIn')}</Button>
            </Link>
          </View>
        ) : (
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
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
            <Button onPress={onSubmit} isPending={isSubmitting}>
              {isSubmitting ? t('auth:forgotPassword.submitting') : t('auth:forgotPassword.submit')}
            </Button>
            <View className="flex-row justify-center mt-2 gap-1">
              <Link href={'/(auth)/sign-in' as Href} replace asChild>
                <Text
                  className="font-sans-semibold text-sm"
                  style={{ color: accent }}
                  accessibilityRole="link"
                >
                  {t('auth:forgotPassword.backToSignIn')}
                </Text>
              </Link>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
