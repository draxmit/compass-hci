import type { LucideIcon } from 'lucide-react-native';
import {
  BookOpen, Bike, Briefcase, Car, Coffee, Coins, Cookie, Droplet, Dumbbell,
  Film, Fuel, Gamepad2, GraduationCap, Gift, HeartPulse, Home, Landmark, Music,
  ParkingCircle, Phone, Pill, Pizza, Plane, ShoppingCart, Shirt, Sparkles,
  Stethoscope, Tag, Train, TrendingUp, Tv, Tv2, Utensils, Wallet, Wifi, Zap,
} from 'lucide-react-native';

import type { CategoryIcon as CategoryIconKey } from '@compass/shared-types';

/**
 * String-keyed Lucide registry for category icons (ADR-05 §4). Keeps the
 * Lucide bundle tight by importing only the curated subset, and gives the
 * Category doc a typed `icon` field whose values are guaranteed to resolve.
 */
export const CATEGORY_ICONS: Record<CategoryIconKey, LucideIcon> = {
  'utensils': Utensils,
  'coffee': Coffee,
  'shopping-cart': ShoppingCart,
  'pizza': Pizza,
  'cookie': Cookie,
  'car': Car,
  'fuel': Fuel,
  'train': Train,
  'bike': Bike,
  'parking-circle': ParkingCircle,
  'zap': Zap,
  'droplet': Droplet,
  'wifi': Wifi,
  'phone': Phone,
  'tv': Tv,
  'heart-pulse': HeartPulse,
  'shirt': Shirt,
  'tv-2': Tv2,
  'home': Home,
  'sparkles': Sparkles,
  'film': Film,
  'gamepad-2': Gamepad2,
  'music': Music,
  'plane': Plane,
  'stethoscope': Stethoscope,
  'pill': Pill,
  'dumbbell': Dumbbell,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  'wallet': Wallet,
  'gift': Gift,
  'briefcase': Briefcase,
  'trending-up': TrendingUp,
  'coins': Coins,
  'landmark': Landmark,
  'tag': Tag,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

type CategoryIconProps = {
  name: CategoryIconKey;
  color?: string;
  size?: number;
  strokeWidth?: number;
};

export function CategoryIcon({ name, color, size = 18, strokeWidth = 2 }: CategoryIconProps) {
  const Component = CATEGORY_ICONS[name];
  // Spread color only when defined so we don't pass `color: undefined` to
  // the Lucide component (which types it as required ColorValue under
  // `exactOptionalPropertyTypes: true`).
  const colorProp = color !== undefined ? { color } : {};
  return <Component {...colorProp} size={size} strokeWidth={strokeWidth} />;
}
