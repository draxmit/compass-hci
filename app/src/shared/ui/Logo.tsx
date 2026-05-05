import Svg, { Path, Circle } from 'react-native-svg';

export type LogoProps = {
  size?: number;
  color?: string;
};

/**
 * Compass needle logo — geometric, pointing NE. Used in sidebar header,
 * splash, web favicon, app icon. Color defaults to currentColor (CSS) /
 * white (native fallback) so callers can tint via parent theme/accent.
 */
export function Logo({ size = 32, color = 'currentColor' }: LogoProps) {
  // 24x24 viewBox; needle is a tall diamond rotated 45deg.
  // North pointer (filled) + South pointer (outlined) + center pivot.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* North needle (NE-pointing diamond half) */}
      <Path d="M12 2 L16 12 L12 13 Z" fill={color} />
      {/* South needle (outlined half, faint) */}
      <Path d="M12 22 L8 12 L12 13 Z" fill={color} fillOpacity={0.45} />
      {/* Center pivot */}
      <Circle cx={12} cy={12.5} r={1.4} fill={color} />
    </Svg>
  );
}
