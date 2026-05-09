import type { Category } from '@compass/shared-types';
import type { TFunction } from 'i18next';
import { AlertTriangle } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import { parseAmountInput } from '@/shared/utils/amountInput';

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
 * Bottom-sheet modal for the multi-split editor (ADR-14 + D4 feedback).
 * Replaces the prior inline pattern where SplitsBlock lived directly in
 * the form — that pattern read as "busy" because the block has its own
 * Card chrome + footer + scrolling list which compete with the
 * surrounding form sections.
 *
 * Layout matches QuickPresetMenu and the Insights heatmap day sheet:
 *   - tinted backdrop (tap to cancel)
 *   - sheet stuck to the bottom of the viewport with rounded top
 *     corners and safe-area-aware bottom padding
 *   - draggable handle for swipe-to-close (same PanResponder pattern
 *     as QuickPresetMenu — release past 100px or vy>0.5 closes)
 *   - sticky header with Cancel / title / Done
 *   - inline warning bar surfaces what's blocking Done
 *   - scrollable body for the SplitsBlock
 *
 * `onConfirm` is wired to the explicit Done button — it doesn't
 * validate here, the parent form's save handler does that on submit.
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
  // category OR when the row amounts don't sum to the form's total.
  // Empty-amount rows fall under the sum check (sum < total →
  // mismatch). Three states surface in the warning bar:
  //   - hasEmptyCategory  → 'Pick a category for each row'
  //   - sumMismatch       → 'Splits don't add up'
  //   - both              → empty-category takes precedence
  const hasEmptyCategory = rows.some((r) => !r.categoryId);
  const total = parseAmountInput(totalText, lang);
  const sum = rows.reduce(
    (acc, r) => acc + parseAmountInput(r.amountText, lang),
    0,
  );
  const sumMismatch = total > 0 && sum !== total;
  const canConfirm = !hasEmptyCategory && !sumMismatch;
  const warningKey = hasEmptyCategory
    ? 'transactions:entry.errors.splitsMissingCategory'
    : sumMismatch
      ? 'transactions:entry.errors.splitsMustSumToTotal'
      : null;

  // Swipe-to-close — same PanResponder + Animated.translateY pattern
  // as QuickPresetMenu / Insights heatmap day sheet. Drag handle owns
  // the gesture; release past threshold animates off-screen before
  // calling onClose so the gesture feels natural.
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, gesture) => {
        sheetTranslateY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_e, gesture) => {
        const isTap = Math.abs(gesture.dy) < 4 && Math.abs(gesture.vy) < 0.1;
        const shouldClose = isTap || gesture.dy > 100 || gesture.vy > 0.5;
        if (shouldClose) {
          Animated.timing(sheetTranslateY, {
            toValue: 800,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            onClose();
            sheetTranslateY.setValue(0);
          });
        } else {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    }),
    [sheetTranslateY, onClose],
  );
  // Reset drag offset whenever the sheet (re)opens — a previous close
  // animation could have left it at the off-screen value.
  useEffect(() => {
    if (visible) sheetTranslateY.setValue(0);
  }, [visible, sheetTranslateY]);

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      transparent={true}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end',
        }}
      >
        {/* Backdrop — tap above the sheet to cancel. */}
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.cancel')}
        />
        <Animated.View
          style={{
            backgroundColor: overlayBg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: Math.max(16, insets.bottom),
            // Cap height at 85% of viewport so the body scrolls inside
            // the sheet rather than pushing the sticky header off-screen.
            maxHeight: '85%',
            transform: [{ translateY: sheetTranslateY }],
          }}
        >
          {/* Drag handle — wrapped in a tall hit-area View that owns
              the PanResponder. View (not Pressable) so the gesture
              system isn't fighting Pressable's own touch handling.
              Tap-on-handle still dismisses via the isTap branch. */}
          <View
            style={{ alignItems: 'center', paddingVertical: 10 }}
            {...sheetPanResponder.panHandlers}
          >
            <View
              style={{
                width: 40, height: 4, borderRadius: 2,
                backgroundColor: borderColor,
              }}
            />
          </View>

          {/* Header — title + Cancel / Done buttons. Sticky at the top
              of the sheet (above the scrollable body) so the user can
              dismiss without scrolling back up on tall split lists. */}
          <View
            className="flex-row items-center justify-between px-5"
            style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: borderColor }}
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

          {/* Inline error bar — surfaces what's blocking Done. Two
              possible blockers (empty-category, sum-mismatch); empty
              takes precedence since you can't even start summing
              until a category is picked. */}
          {warningKey ? (
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
                {t(warningKey)}
              </Text>
            </View>
          ) : null}

          {/* Body — SplitsBlock reused as-is. ScrollView so long split
              lists (more rows than fit in 85vh) can scroll inside the
              sheet. Tight padding so the stacked amount field gets all
              the room it needs on mobile. */}
          <ScrollView
            contentContainerStyle={{ padding: 8 }}
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
        </Animated.View>
      </View>
    </Modal>
  );
}
