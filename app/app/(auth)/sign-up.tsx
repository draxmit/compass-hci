// TODO(T3): i18n
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';

import { signUpWithEmailPassword, useGoogleSignIn } from '@/services/firebase';
import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { tokens } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { Logo } from '@/shared/ui/Logo';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';

export default function SignUpScreen() {
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
      setError('Please enter a display name.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signUpWithEmailPassword(email.trim(), password, displayName.trim());
      // Auth state propagates → AuthGate redirects to (tabs).
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-up failed.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // See sign-in.tsx — Google sign-in only works on web until we ship an EAS
  // dev client; tapping on native shows a "coming soon" alert instead of
  // failing on the unauthorized LAN redirect URI.
  const onGoogle = async () => {
    setError(null);
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Coming soon on Android',
        'Google sign-in will land with our next build. For now, please create your account with email & password.',
      );
      return;
    }
    const result = await googlePromptAsync();
    if (result.type === 'error') setError(result.message);
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
        <Text className="font-sans-bold text-2xl text-center mb-2">Create your account</Text>
        <Text className="text-center text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-8">
          Start tracking your money in less than a minute.
        </Text>

        <View className="gap-4">
          <TextField
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
          />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
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
            {isSubmitting ? 'Creating account…' : 'Sign up'}
          </Button>
        </View>

        <View className="flex-row items-center my-6">
          <View className="flex-1 h-px bg-surface-light-border dark:bg-surface-dark-border" />
          <Text className="px-3 text-xs uppercase tracking-wider text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
            or
          </Text>
          <View className="flex-1 h-px bg-surface-light-border dark:bg-surface-dark-border" />
        </View>

        <Button variant="secondary" onPress={onGoogle} isPending={isGooglePending}>
          Continue with Google
        </Button>

        <View className="flex-row justify-center mt-8 gap-1">
          <Text className="text-sm text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
            Already have an account?
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
      </Card>
    </ScrollView>
  );
}
