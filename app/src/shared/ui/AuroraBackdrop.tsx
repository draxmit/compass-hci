import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { tokens } from '@/shared/theme/tokens';
import { useUiStore } from '@/stores/uiStore';

export type AuroraBackdropProps = {
  variant?: 'subtle' | 'standard' | 'strong';
};

/**
 * Native AuroraBackdrop. Static LinearGradient behind everything.
 * On low-end devices we degrade to a flat dark background to save GPU.
 * Non-interactive (pointerEvents="none") so it never intercepts touches.
 */
export function AuroraBackdrop({ variant = 'standard' }: AuroraBackdropProps) {
  const lowEndMode = useUiStore((s) => s.lowEndMode);

  const opacity = variant === 'subtle' ? 0.35 : variant === 'strong' ? 0.85 : 0.6;

  if (lowEndMode) {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: tokens.surface['dark-bg'], opacity }]}
      />
    );
  }

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[
        tokens.aurora.violet,
        tokens.aurora.cyan,
        tokens.aurora.magenta,
        tokens.aurora.amber,
      ]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, { opacity }]}
    />
  );
}
