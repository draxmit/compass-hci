import { Stack } from 'expo-router';

// TODO(T10): redirect to (tabs) if user.onboardingComplete === true.
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />;
}
