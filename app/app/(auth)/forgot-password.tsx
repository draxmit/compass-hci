// TODO(T3): i18n
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { sendPasswordReset } from '@/services/firebase';
import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
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
      <Card padding="lg" className="w-full max-w-md">
        <View className="items-center mb-6">
          <Logo size={48} color={accent} />
        </View>
        <Text className="font-sans-bold text-2xl text-center mb-2">Reset your password</Text>
        <Text className="text-center text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-8">
          Enter your email and we&apos;ll send a reset link.
        </Text>

        {submitted ? (
          <View className="gap-4">
            <Text className="text-center">
              If that email is registered, a reset link has been sent.
            </Text>
            <Link href={'/(auth)/sign-in' as Href} asChild>
              <Button onPress={() => undefined}>Back to sign in</Button>
            </Link>
          </View>
        ) : (
          <View className="gap-4">
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />
            <Button onPress={onSubmit} isPending={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </Button>
            <View className="flex-row justify-center mt-2 gap-1">
              <Text className="text-sm text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
                Remembered it?
              </Text>
              <Link href={'/(auth)/sign-in' as Href} asChild>
                <Text
                  className="font-sans-semibold text-sm"
                  style={{ color: accent }}
                  accessibilityRole="link"
                >
                  Sign in
                </Text>
              </Link>
            </View>
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
