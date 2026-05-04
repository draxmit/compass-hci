import {
  Barlow_300Light,
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  useFonts as useBarlow,
} from '@expo-google-fonts/barlow';
import {
  InstrumentSerif_400Regular_Italic,
  useFonts as useInstrumentSerif,
} from '@expo-google-fonts/instrument-serif';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import '../global.css';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';
import { AuroraBackdrop } from '@/shared/ui/AuroraBackdrop';
import { detectLowEndMode, useUiStore } from '@/stores/uiStore';

export default function RootLayout() {
  const [serifLoaded] = useInstrumentSerif({
    InstrumentSerif_400Regular_Italic,
  });
  const [sansLoaded] = useBarlow({
    Barlow_300Light,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
  });

  useEffect(() => {
    let cancelled = false;
    detectLowEndMode().then((value) => {
      if (!cancelled) useUiStore.getState().setLowEndMode(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!serifLoaded || !sansLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <AuroraBackdrop variant="standard" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}
