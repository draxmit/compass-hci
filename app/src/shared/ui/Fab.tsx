import { Pressable, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '@/shared/theme/tokens';
import { usePageAccent } from '@/shared/hooks/usePageAccent';

export type FabProps = {
  onPress?: () => void;
};

// FAB sits inside the bottom nav bar visually — small lift above the OS nav
// inset so it integrates with the tab bar rather than floating above the
// content. Smaller circle (48px vs Material's 56px) keeps it from crowding
// the Transactions/Budgets cells when they sit either side.
const FAB_LIFT_FROM_NAV = 16;

/**
 * Mobile-only FAB ("+ new transaction"). Sits docked in the bottom nav band,
 * tinted with the active page accent. T6 wires the actual quick-entry sheet.
 */
export function Fab({ onPress }: FabProps) {
  const { color } = usePageAccent();
  const insets = useSafeAreaInsets();
  const bottomOffset = insets.bottom + FAB_LIFT_FROM_NAV;

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
        className="w-12 h-12 rounded-full items-center justify-center"
        style={{
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Plus size={22} color={tokens.surface['dark-fg']} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}
