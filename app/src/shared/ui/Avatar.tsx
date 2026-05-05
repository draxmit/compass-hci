import { useState } from 'react';
import { Image, View } from 'react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from './Text';

export type AvatarProps = {
  photoURL?: string | null;
  displayName?: string | null;
  email?: string | null;
  size?: number;
};

/**
 * Circular avatar. Always renders initials over a per-user-stable tinted
 * background as the base layer; if `photoURL` is provided AND loads
 * successfully, the photo is overlaid on top. Image load failure → initials
 * stay visible. RN Web's Image rendering of remote photos is occasionally
 * flaky (Google profile photos can hit CORS / referrer policy quirks); the
 * always-render-initials fallback keeps the avatar readable regardless.
 */
export function Avatar({ photoURL, displayName, email, size = 64 }: AvatarProps) {
  const { resolvedScheme } = useTheme();
  const [imgFailed, setImgFailed] = useState(false);
  const initials = computeInitials(displayName, email);
  const seedKey = (displayName ?? email ?? '?').toLowerCase();
  const accentKey = pickAccent(seedKey);
  const bgColor = tokens.accent[accentKey];
  const fgColor = '#ffffff';
  const isDark = resolvedScheme === 'dark';
  const ringColor = isDark
    ? tokens.surface['dark-border']
    : tokens.surface['light-border'];
  const showImage = !!photoURL && !imgFailed;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${displayName ?? email ?? 'user'} avatar`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: ringColor,
        overflow: 'hidden',
      }}
    >
      <Text
        className="font-sans-bold"
        style={{ color: fgColor, fontSize: Math.round(size * 0.4) }}
      >
        {initials}
      </Text>
      {showImage ? (
        <Image
          source={{ uri: photoURL! }}
          accessibilityIgnoresInvertColors
          onError={() => setImgFailed(true)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
        />
      ) : null}
    </View>
  );
}

function computeInitials(displayName?: string | null, email?: string | null): string {
  const source = displayName?.trim() || email?.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const word = parts[0];
    if (!word) return '?';
    return word.slice(0, 2).toUpperCase();
  }
  const first = parts[0]?.[0] ?? '';
  const second = parts[parts.length - 1]?.[0] ?? '';
  return (first + second).toUpperCase();
}

function pickAccent(seed: string): 'dashboard' | 'transactions' | 'budgets' | 'insights' {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  const keys = ['dashboard', 'transactions', 'budgets', 'insights'] as const;
  return keys[Math.abs(hash) % keys.length] ?? 'dashboard';
}
