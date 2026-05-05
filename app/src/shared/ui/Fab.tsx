import { Pressable, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '@/shared/theme/tokens';
import { usePageAccent } from '@/shared/hooks/usePageAccent';

export type FabProps = {
  onPress?: () => void;
};

// Default Android bottom-tab bar height. RN Bottom Tabs doesn't expose this
// statically, so we hardcode a sensible value — enough lift to keep the FAB
// clear of the Transactions/Budgets cells without floating absurdly high.
const TAB_BAR_HEIGHT = 56;
const FAB_GAP_ABOVE_TAB_BAR = 24;

/**
 * Mobile-only FAB ("+ new transaction"). Floats above the bottom tab bar,
 * tinted with the active page accent. T6 wires the actual quick-entry sheet.
 */
export function Fab({ onPress }: FabProps) {
  const { color } = usePageAccent();
  const insets = useSafeAreaInsets();
  const bottomOffset = insets.bottom + TAB_BAR_HEIGHT + FAB_GAP_ABOVE_TAB_BAR;

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 items-center"
      style={{ bottom: bottomOffset, zIndex: 10 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New transaction"
        onPress={onPress}
        className="w-14 h-14 rounded-full items-center justify-center"
        style={{
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Plus size={26} color={tokens.surface['dark-fg']} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}
