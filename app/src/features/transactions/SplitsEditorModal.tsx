import type { Category } from '@compass/shared-types';
import type { TFunction } from 'i18next';
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

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="pageSheet"
      transparent={false}
    >
      <View style={{ flex: 1, backgroundColor: overlayBg, paddingTop: insets.top }}>
        {/* Header — title + close X. Mirrors the rest of the app's
            modal-stack style (back chevron is replaced with an explicit
            Cancel here since this is a transient editor, not a route). */}
        <View
          className="flex-row items-center justify-between px-6"
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
            onPress={onConfirm}
            hitSlop={8}
            style={{ minHeight: 36, justifyContent: 'center' }}
          >
            <Text
              className="font-sans-semibold text-sm"
              style={{ color: tokens.accent.transactions }}
            >
              {t('common:actions.done')}
            </Text>
          </Pressable>
        </View>

        {/* Body — SplitsBlock reused as-is. No `Card` wrap here because
            the block already provides its own. */}
        <ScrollView
          contentContainerStyle={{
            padding: 24,
            paddingBottom: 24 + insets.bottom,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="self-center w-full max-w-md lg:max-w-3xl">
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
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
