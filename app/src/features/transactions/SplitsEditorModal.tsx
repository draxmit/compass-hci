import type { Category } from '@compass/shared-types';
import type { TFunction } from 'i18next';
import { AlertTriangle } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';

import { SplitsBlock } from './SplitsBlock';
import type { SplitRowState } from './SplitsBlock';

export type SplitsEditorModalProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  rows: SplitRowState[];
  totalText: string;
  categories: Category[];
  lang: Locale;
  onAddRow: () => void;
  onRemoveRow: (idx: number) => void;
  onUpdateRow: (idx: number, patch: Partial<SplitRowState>) => void;
  t: TFunction;
};

/**
 * Full-screen modal that hosts the multi-split editor (ADR-14 + D4
 * feedback). Replaces the prior inline pattern where SplitsBlock lived
 * directly in the form — that pattern read as "busy" because the block
 * has its own Card chrome + footer + scrolling list which compete with
 * the surrounding form sections.
 *
 * The modal is presented as a transparent overlay with a tinted
 * backdrop; tapping the backdrop or pressing back triggers `onClose`
 * (= cancel). `onConfirm` is wired to the explicit Save button at the
 * bottom — it doesn't validate here, the parent form's save handler
 * does that on submit.
 */
export function SplitsEditorModal({
  visible, onClose, onConfirm, rows, totalText, categories, lang,
  onAddRow, onRemoveRow, onUpdateRow, t,
}: SplitsEditorModalProps) {
  const { resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === 'dark';
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];

  // Validation gate — Done is blocked while any row is missing its
  // category. Prevents the form-save handler from later rejecting the
  // tx (the previous user-flagged ambiguity: "why empty category is
  // allowed in split categories"). Empty-amount rows are NOT blocked
  // here because zero-amount is still valid as 'I'll fill it in';
  // the sum-mismatch check at form-save catches that.
  const hasEmptyCategory = rows.some((r) => !r.categoryId);
  const canConfirm = !hasEmptyCategory;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
      transparent={true}
    >
      {/* Centered card popup, not a bottom sheet — fades in over a
          tinted backdrop. Tap-outside dismisses (= cancel). The card
          is capped at ~520px on web; on narrow mobile it falls back
          to ~95% width with a small inset so it doesn't feel pinned
          to the edges. */}
      <Pressable
        accessibilityLabel={t('common:actions.cancel')}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Inner Pressable swallows tap so clicks INSIDE the card
            don't dismiss. */}
        <Pressable
          onPress={() => { /* swallow */ }}
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: '100%',
            borderRadius: 16,
            backgroundColor: overlayBg,
            overflow: 'hidden',
          }}
        >
        {/* Header — title + Cancel / Done buttons. */}
        <View
          className="flex-row items-center justify-between px-5"
          style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: borderColor }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.cancel')}
            onPress={onClose}
            hitSlop={8}
            style={{ minHeight: 36, justifyContent: 'center' }}
          >
            <Text className="font-sans-medium text-sm" style={{ color: mutedColor }}>
              {t('common:actions.cancel')}
            </Text>
          </Pressable>
          <Text className="font-sans-semibold text-base" style={{ color: fgColor }}>
            {t('transactions:entry.splits.modalTitle')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.done')}
            accessibilityState={{ disabled: !canConfirm }}
            onPress={onConfirm}
            disabled={!canConfirm}
            hitSlop={8}
            style={{
              minHeight: 36,
              justifyContent: 'center',
              opacity: canConfirm ? 1 : 0.4,
            }}
          >
            <Text
              className="font-sans-semibold text-sm"
              style={{ color: tokens.accent.transactions }}
            >
              {t('common:actions.done')}
            </Text>
          </Pressable>
        </View>

        {/* Inline error bar — surfaces at the top of the body when any
            row is missing its category. Mirrors the pattern in form
            validation; explicit so the user knows why Done is greyed. */}
        {hasEmptyCategory ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: tokens.semantic.warning + '14',
              borderBottomWidth: 1,
              borderBottomColor: tokens.semantic.warning + '33',
            }}
          >
            <AlertTriangle size={14} color={tokens.semantic.warning} />
            <Text
              className="font-sans text-xs flex-1"
              style={{ color: tokens.semantic.warning }}
            >
              {t('transactions:entry.errors.splitsMissingCategory')}
            </Text>
          </View>
        ) : null}

        {/* Body — SplitsBlock reused as-is. */}
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <SplitsBlock
            rows={rows}
            totalText={totalText}
            categories={categories}
            isDark={isDark}
            lang={lang}
            fgColor={fgColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            onAddRow={onAddRow}
            onRemoveRow={onRemoveRow}
            onUpdateRow={onUpdateRow}
            t={t}
          />
        </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
