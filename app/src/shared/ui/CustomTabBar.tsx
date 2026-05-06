import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
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
      {renderIcon?.({ focused: selected, color: iconColor, size: 18 })}
      <Text
        style={{
          color: iconColor,
          fontSize: 10,
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
  const { t } = useTranslation(['common']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const { color: activeAccent } = usePageAccent();
  const isDark = resolvedScheme === 'dark';

  const inactiveColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  // Slightly-elevated tab bar surface, distinct from page bg, so the
  // PageBackdrop accent gradient can't visually bleed into the nav chrome.
  // Hand-picked: page bg is #0a0a0a / #fafafa; tab bar one notch up.
  const tabBarBg = isDark ? '#141414' : '#f3f3f3';
  // Stronger border + upward shadow so the bar reads as a clearly separate
  // surface "floating above" the content (Mercury-style elevated nav).
  const tabBarBorder = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(10,10,10,0.18)';

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
        // Elevated above the content. iOS picks up shadowColor/Offset/Radius;
        // Android needs `elevation` AND a non-transparent backgroundColor
        // (which we have above) for the platform shadow to actually render.
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: isDark ? 0.5 : 0.08,
        shadowRadius: 8,
        elevation: 12,
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
                accessibilityLabel={t('common:nav.newTransaction')}
                // Same trick as the avatar tap (see MobileTopBar): replace
                // instead of push, so there's no layered Stack underneath
                // the new screen for Android to snapshot-reveal during the
                // transition. Save/cancel paths in /transaction/new use
                // canGoBack-fallback to land on the right tab.
                onPress={() => router.replace('/transaction/new')}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
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
                <Plus size={24} color={tokens.surface['dark-fg']} strokeWidth={2.5} />
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
