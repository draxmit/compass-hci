import { View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { tokens } from '@/shared/theme/tokens';

export type AuroraBackdropProps = {
  variant?: 'subtle' | 'standard' | 'strong';
};

/**
 * Web AuroraBackdrop. Fixed-position div with a slow CSS rotation animation,
 * disabled by `@media (prefers-reduced-motion: reduce)`.
 *
 * Implementation note: NativeWind on web maps `style` to inline CSS, so we
 * render the keyframes once via a side-channel <style> tag and reference the
 * animation by name. This avoids needing an extra CSS file.
 */
export function AuroraBackdrop({ variant = 'standard' }: AuroraBackdropProps) {
  const opacity = variant === 'subtle' ? 0.35 : variant === 'strong' ? 0.85 : 0.6;

  const gradient = `linear-gradient(120deg, ${tokens.aurora.violet}, ${tokens.aurora.cyan}, ${tokens.aurora.magenta}, ${tokens.aurora.amber})`;

  // Cast through unknown — these CSS properties aren't in ViewStyle.
  const wrapperStyle = {
    position: 'fixed',
    inset: 0,
    backgroundImage: gradient,
    backgroundSize: '200% 200%',
    opacity,
    pointerEvents: 'none',
    zIndex: -1,
    animation: 'compass-aurora-rotate 60s linear infinite',
  } as unknown as ViewStyle;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes compass-aurora-rotate {
              0%   { background-position:   0% 50%; }
              50%  { background-position: 100% 50%; }
              100% { background-position:   0% 50%; }
            }
            @media (prefers-reduced-motion: reduce) {
              .compass-aurora-bg { animation: none !important; }
            }
          `,
        }}
      />
      <View className="compass-aurora-bg" style={wrapperStyle} />
    </>
  );
}
