import type { Category } from '@compass/shared-types';
import type { TFunction } from 'i18next';
import { Pencil, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';

import type { SplitRowState } from './SplitsBlock';

export type SplitsSummaryCardProps = {
  rows: SplitRowState[];
  categories: Category[];
  isDark: boolean;
  lang: Locale;
  onEdit: () => void;
  onCollapse: () => void;
  t: TFunction;
};

/**
 * Compact summary that replaces the inline CategoryPicker when the
 * transaction is in multi-split mode (ADR-14 + D4 redesign). Shows
 * a row of category-icon chips + Edit and "Use single category"
 * buttons. Keeps the form short — actual editing happens in
 * `SplitsEditorModal`.
 *
 * The chips here are display-only; tapping them is a no-op (the
 * Edit button is the affordance). Categories without a selected
 * id render as a muted "?" placeholder so partially-filled rows
 * don't disappear from the visual count.
 */
export function SplitsSummaryCard({
  rows, categories, isDark, lang, onEdit, onCollapse, t,
}: SplitsSummaryCardProps) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  return (
    <Card padding="lg" className="mb-4">
      <View className="flex-row items-center justify-between mb-3">
        <Text
          className="font-sans-medium text-xs uppercase tracking-wider"
          style={{ color: mutedColor }}
        >
          {t('transactions:entry.fields.category')}
        </Text>
        <Text className="font-sans text-xs" style={{ color: mutedColor }}>
          {t('transactions:entry.splits.summaryCount', {
            count: rows.length,
            context: rows.length === 1 ? 'one' : 'other',
          })}
        </Text>
      </View>

      {/* Visual row of selected category icons. Wraps on overflow. */}
      <View className="flex-row flex-wrap" style={{ gap: 6, marginBottom: 12 }}>
        {rows.map((row, idx) => {
          const cat = row.categoryId
            ? categories.find((c) => c.id === row.categoryId)
            : null;
          const tint = cat
            ? resolveCategoryColor(cat.color, isDark ? 'dark' : 'light')
            : mutedColor;
          return (
            <View
              key={idx}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: cat ? tint : borderColor,
                backgroundColor: cat ? tint + '14' : 'transparent',
              }}
            >
              {cat ? (
                <CategoryIcon name={cat.icon} color={tint} size={11} />
              ) : null}
              <Text
                className="font-sans-medium text-xs"
                style={{ color: cat ? tint : mutedColor }}
                numberOfLines={1}
              >
                {cat ? cat.name[lang] : '—'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Edit (flex 1, full-width text) + back-to-single (icon-only,
          fixed 40px). Was previously two text buttons side-by-side
          which overflowed on narrow mobile widths because the
          'Back to single category' label is long; the icon-only
          variant keeps the same affordance with the accessibility
          label intact for screen readers. */}
      <View className="flex-row" style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('transactions:entry.splits.editSplits')}
          onPress={onEdit}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: tokens.accent.transactions,
            backgroundColor: tokens.accent.transactions + '14',
            minHeight: 40,
          }}
        >
          <Pencil size={14} color={tokens.accent.transactions} />
          <Text
            className="font-sans-medium text-sm"
            style={{ color: tokens.accent.transactions }}
          >
            {t('transactions:entry.splits.editSplits')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('transactions:entry.splits.toggleToSingle')}
          onPress={onCollapse}
          style={{
            width: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            borderWidth: 1,
            borderColor,
            minHeight: 40,
          }}
        >
          <X size={14} color={fgColor} />
        </Pressable>
      </View>
    </Card>
  );
}
