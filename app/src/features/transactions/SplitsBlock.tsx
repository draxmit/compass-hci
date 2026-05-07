import type { Category } from '@compass/shared-types';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatAmountInput, parseAmountInput } from '@/shared/utils/amountInput';
import { formatIDR } from '@/shared/utils/formatIDR';

/**
 * Multi-category splits editor (ADR-14). Used inside `/transaction/new`
 * and `/transaction/[id]` when the user toggles to "Split across
 * categories" mode.
 *
 * Each row is an inline `[category-chip-with-dropdown] [amount-field]
 * [×]` triple. One row's category picker is open at a time. Footer
 * shows total / sum / remainder with traffic-light colour: muted when
 * balanced, warning-amber when unallocated, danger-red when over.
 */

export type SplitRowState = {
  categoryId: string | null;
  amountText: string;
};

export type SplitsBlockProps = {
  rows: SplitRowState[];
  totalText: string;
  categories: Category[];
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
  onUpdateRow: (idx: number, patch: Partial<SplitRowState>) => void;
  t: TFunction;
};

export function SplitsBlock({
  rows, totalText, categories, isDark, lang,
  fgColor, mutedColor, borderColor,
  onAddRow, onRemoveRow, onUpdateRow, t,
}: SplitsBlockProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  // Auto-expand the picker for a freshly-added row (rows.length grew
  // since the last render). Without this, "+ Add row" creates an
  // invisible empty row — the user has to tap the row to find out it
  // needs a category.
  const prevRowsLength = useRef(rows.length);
  useEffect(() => {
    if (rows.length > prevRowsLength.current) {
      setOpenIdx(rows.length - 1);
    }
    prevRowsLength.current = rows.length;
  }, [rows.length]);

  const total = parseAmountInput(totalText, lang);
  const sum = rows.reduce((s, r) => s + parseAmountInput(r.amountText, lang), 0);
  const remainder = total - sum;
  const remainderState: 'done' | 'unallocated' | 'over' =
    remainder === 0 ? 'done' : remainder > 0 ? 'unallocated' : 'over';
  const remainderColor =
    remainderState === 'done'
      ? mutedColor
      : remainderState === 'over'
        ? tokens.semantic.danger
        : tokens.semantic.warning;

  return (
    <Card padding="md" className="mb-2">
      <Text
        className="font-sans-medium text-xs uppercase tracking-wider mb-2"
        style={{ color: mutedColor }}
      >
        {t('transactions:entry.fields.category')}
      </Text>
      <View style={{ gap: 10 }}>
        {rows.map((row, idx) => (
          <SplitRow
            key={idx}
            row={row}
            categories={categories}
            isDark={isDark}
            lang={lang}
            fgColor={fgColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            isExpanded={openIdx === idx}
            onToggleExpanded={() => setOpenIdx((cur) => (cur === idx ? null : idx))}
            onUpdate={(patch) => onUpdateRow(idx, patch)}
            onRemove={() => onRemoveRow(idx)}
            canRemove={rows.length > 1}
            t={t}
          />
        ))}
      </View>

      {/* + Add row — disabled when any current row still has no
          category. Otherwise the user could pile up incomplete rows.
          Greyed out + tap blocked when invalid. */}
      {(() => {
        const canAddRow = rows.every((r) => !!r.categoryId);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('transactions:entry.splits.addRow')}
            accessibilityState={{ disabled: !canAddRow }}
            disabled={!canAddRow}
            onPress={onAddRow}
            style={{
              flexDirection: 'row',
              alignSelf: 'flex-start',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 10,
              paddingHorizontal: 12,
              marginTop: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor,
              minHeight: 40,
              opacity: canAddRow ? 1 : 0.4,
            }}
          >
            <Plus size={14} color={fgColor} />
            <Text className="font-sans-medium text-xs" style={{ color: fgColor }}>
              {t('transactions:entry.splits.addRow')}
            </Text>
          </Pressable>
        );
      })()}

      {/* Footer (Total / Allocated / remainder) is only meaningful once
          we have 2+ rows — with a single row, sum trivially equals total
          and the line is just noise. Hidden until the user adds a second
          row. (D2) */}
      {rows.length > 1 ? (
        <View
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: borderColor,
          }}
        >
          <View className="flex-row items-baseline justify-between">
            <Text className="font-sans text-xs" style={{ color: mutedColor }}>
              {t('transactions:entry.splits.totalLine', { amount: formatIDR(total, lang) })}
            </Text>
            <Text className="font-mono tabular-nums text-xs" style={{ color: mutedColor }}>
              {t('transactions:entry.splits.sumLine', { amount: formatIDR(sum, lang) })}
            </Text>
          </View>
          <Text
            className="font-sans-medium text-xs mt-1"
            style={{ color: remainderColor }}
          >
            {remainderState === 'done'
              ? t('transactions:entry.splits.remainderDone')
              : remainderState === 'over'
                ? t('transactions:entry.splits.remainderOver', { amount: formatIDR(Math.abs(remainder), lang) })
                : t('transactions:entry.splits.remainderUnallocated', { amount: formatIDR(remainder, lang) })}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

// ---------- SplitRow (internal) ----------

type SplitRowProps = {
  row: SplitRowState;
  categories: Category[];
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onUpdate: (patch: Partial<SplitRowState>) => void;
  onRemove: () => void;
  canRemove: boolean;
  t: TFunction;
};

function SplitRow({
  row, categories, isDark, lang,
  fgColor, mutedColor, borderColor,
  isExpanded, onToggleExpanded, onUpdate, onRemove, canRemove, t,
}: SplitRowProps) {
  const selectedCat = categories.find((c) => c.id === row.categoryId);
  const tint = selectedCat
    ? resolveCategoryColor(selectedCat.color, isDark ? 'dark' : 'light')
    : mutedColor;

  const pickable = useMemo(
    () => categories.filter((c) => !c.isArchived && c.parentId !== null),
    [categories],
  );

  // Empty-categoryId rows get a warning border so the user sees at a
  // glance which row needs attention. Picker auto-expanded by SplitsBlock
  // for the new row, but the warning persists until a category is picked.
  const isEmpty = !selectedCat;
  const pickerBorder = isEmpty
    ? tokens.semantic.warning
    : borderColor;

  return (
    <View>
      {/* Stacked layout: category picker on its own row (full width)
          + amount field on the row below alongside the optional X
          delete. The previous side-by-side layout left the amount
          field too narrow on mobile to read the number ('couldn't
          even see numbers' user feedback). Stacking gives both fields
          full readable width at the cost of slightly more vertical
          space per row. */}
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={selectedCat ? selectedCat.name[lang] : t('transactions:entry.fields.category')}
          accessibilityState={{ expanded: isExpanded }}
          onPress={onToggleExpanded}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: pickerBorder,
            backgroundColor: isEmpty ? tokens.semantic.warning + '0a' : 'transparent',
            minHeight: 40,
          }}
        >
          {selectedCat ? (
            <>
              <View
                style={{
                  width: 20, height: 20, borderRadius: 5,
                  backgroundColor: tint + '22',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <CategoryIcon name={selectedCat.icon} color={tint} size={11} />
              </View>
              <Text className="font-sans-medium text-xs flex-1" style={{ color: fgColor }} numberOfLines={1}>
                {selectedCat.name[lang]}
              </Text>
            </>
          ) : (
            <Text className="font-sans-medium text-xs flex-1" style={{ color: mutedColor }} numberOfLines={1}>
              {t('transactions:entry.pickers.selectCategory')}
            </Text>
          )}
          {isExpanded ? (
            <ChevronUp size={14} color={mutedColor} />
          ) : (
            <ChevronDown size={14} color={mutedColor} />
          )}
        </Pressable>
      </View>

      {/* Amount row — full-width number field with optional × delete
          alongside. Stacked under the category picker so the number
          gets the entire row width to read on mobile.
          × delete is only useful when there's more than one row.
          With a single row, the user can just blank the amount or
          change categories — removing the only row leaves the form
          in an invalid state anyway. Hidden until rows.length >= 2. */}
      <View
        className="flex-row items-center"
        style={{ gap: 6, marginTop: 6 }}
      >
        <View style={{ flex: 1 }}>
          <TextField
            label=""
            value={row.amountText}
            onChangeText={(text) => onUpdate({ amountText: formatAmountInput(text, lang) })}
            placeholder="0"
            keyboardType="numeric"
          />
        </View>
        {canRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('transactions:entry.splits.removeRow')}
            onPress={onRemove}
            style={{
              width: 36, height: 36, borderRadius: 8,
              borderWidth: 1, borderColor,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} color={tokens.semantic.danger} />
          </Pressable>
        ) : null}
      </View>

      {isExpanded ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingTop: 8, paddingRight: 8 }}
        >
          {pickable.map((cat) => {
            const active = row.categoryId === cat.id;
            const t2 = resolveCategoryColor(cat.color, isDark ? 'dark' : 'light');
            return (
              <Pressable
                key={cat.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  onUpdate({ categoryId: cat.id });
                  onToggleExpanded();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 9,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? t2 : borderColor,
                  backgroundColor: active ? t2 + '14' : 'transparent',
                }}
              >
                <CategoryIcon name={cat.icon} color={t2} size={12} />
                <Text className="font-sans-medium text-xs" style={{ color: active ? t2 : fgColor }}>
                  {cat.name[lang]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
