import { Stack } from 'expo-router';

// TODO(T2): redirect to (tabs) if user is authenticated.
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />;
}
