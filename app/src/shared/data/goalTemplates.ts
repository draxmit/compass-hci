import type { CategoryColor, CategoryIcon } from '@compass/shared-types';

/**
 * Indonesian-context goal templates (ADR-15 §3). User taps one in the
 * add-goal flow → name + suggestedTargetMinor pre-fill, both editable
 * before save. Targets are conservative defaults reflecting typical
 * Jakarta-retail amounts in 2026.
 */

export type GoalTemplate = {
  key: string;
  name: { id: string; en: string };
  suggestedTargetMinor: number;
  icon: CategoryIcon;
  color: CategoryColor;
};

export const GOAL_TEMPLATES: readonly GoalTemplate[] = [
  {
    key: 'lebaran_thr',
    name: { id: 'Lebaran THR', en: 'Lebaran THR' },
    suggestedTargetMinor: 5_000_000_00,
    icon: 'gift',
    color: 'pink',
  },
  {
    key: 'dana_darurat',
    name: { id: 'Dana Darurat', en: 'Emergency Fund' },
    suggestedTargetMinor: 30_000_000_00,
    icon: 'wallet',
    color: 'teal',
  },
  {
    key: 'beli_motor',
    name: { id: 'Beli Motor', en: 'New Bike' },
    suggestedTargetMinor: 25_000_000_00,
    icon: 'bike',
    color: 'blue',
  },
  {
    key: 'kawinan',
    name: { id: 'Kawinan', en: 'Wedding' },
    suggestedTargetMinor: 80_000_000_00,
    icon: 'sparkles',
    color: 'pink',
  },
  {
    key: 'liburan',
    name: { id: 'Liburan Bali', en: 'Bali Holiday' },
    suggestedTargetMinor: 8_000_000_00,
    icon: 'plane',
    color: 'cyan',
  },
  {
    key: 'dp_rumah',
    name: { id: 'DP Rumah', en: 'House Down Payment' },
    suggestedTargetMinor: 100_000_000_00,
    icon: 'home',
    color: 'indigo',
  },
];

export function getTemplate(key: string | null): GoalTemplate | null {
  if (!key) return null;
  return GOAL_TEMPLATES.find((t) => t.key === key) ?? null;
}
