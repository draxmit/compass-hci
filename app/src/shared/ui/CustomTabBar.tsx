import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from './Text';

// Order in the bar: Dashboard, Transactions, [+ FAB], Budgets, Insights.
// The FAB takes its own evenly-sized cell rather than being absolutely
// positioned in the gap between two tabs — keeps the icons of Transactions
// and Budgets a full cell-width away from the FAB.
const FAB_SLOT = '__fab__';
const TAB_ORDER: readonly string[] = ['index', 'transactions', FAB_SLOT, 'budgets', 'insights'];

const TAB_BAR_HEIGHT = 56;

type TabCellProps = {
  iconColor: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  renderIcon: ((props: { focused: boolean; color: string; size: number }) => React.ReactNode) | undefined;
};

function TabCell({ iconColor, label, selected, onPress, renderIcon }: TabCellProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
    >
      {renderIcon?.({ focused: selected, color: iconColor, size: 22 })}
      <Text
        style={{
          color: iconColor,
          fontSize: 11,
          fontFamily: 'Inter_500Medium',
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Custom 5-cell tab bar. Replaces React Navigation's default bar so the FAB
 * can occupy a real cell instead of floating between two tab buttons. T6 will
 * wire the FAB onPress to the quick-entry sheet.
 */
export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const { color: activeAccent } = usePageAccent();
  const isDark = resolvedScheme === 'dark';

  const inactiveColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const tabBarBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const tabBarBorder = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const activeRouteName = state.routes[state.index]?.name;

  return (
    <View
      style={{
        flexDirection: 'row',
        height: TAB_BAR_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom,
        backgroundColor: tabBarBg,
        borderTopWidth: 1,
        borderTopColor: tabBarBorder,
      }}
    >
      {TAB_ORDER.map((tabName) => {
        if (tabName === FAB_SLOT) {
          return (
            <View
              key={tabName}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New transaction"
                onPress={() => {
                  // T6 wires the actual quick-entry sheet.
                }}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: activeAccent,
                  shadowColor: activeAccent,
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

        const route = state.routes.find((r) => r.name === tabName);
        if (!route) return null;
        const descriptor = descriptors[route.key];
        if (!descriptor) return null;
        const { options } = descriptor;
        const isFocused = activeRouteName === tabName;
        const cellColor = isFocused ? activeAccent : inactiveColor;
        const labelText =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : typeof options.title === 'string'
              ? options.title
              : tabName;

        return (
          <TabCell
            key={tabName}
            iconColor={cellColor}
            label={labelText}
            selected={isFocused}
            renderIcon={options.tabBarIcon}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name as never);
              }
            }}
          />
        );
      })}
    </View>
  );
}
