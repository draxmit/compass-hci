import { Slot, Tabs } from 'expo-router';
import { ArrowLeftRight, Home, Menu, PieChart } from 'lucide-react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { Fab } from '@/shared/ui/Fab';

/**
 * Adaptive tabs layout.
 *
 * On mobile: bottom tabs (4 items) + center FAB above the bar.
 * On desktop: <Slot/> renders the active child route directly with no
 * Tabs navigator chrome — Sidebar provides navigation. Without this, the
 * Tabs scene container would stack visited screens on top of each other
 * when the bottom tab bar is hidden via `display: 'none'` (React
 * Navigation v7 has no `unmountOnBlur` option for Bottom Tabs).
 *
 * Insights moved to root /insights stack route, reachable from sidebar
 * on desktop or More menu on mobile.
 */
export default function TabsLayout() {
  const { resolvedScheme } = useTheme();
  const { color: activeColor } = usePageAccent();
  const isDesktop = useIsDesktop();
  const isDark = resolvedScheme === 'dark';

  if (isDesktop) {
    // Desktop: no Tabs navigator. Sidebar handles nav, Slot renders the
    // matched child route. Eliminates the screen-overlap bug entirely.
    return <Slot />;
  }

  const inactiveColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const tabBarBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const tabBarBorder = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: inactiveColor,
          tabBarLabelStyle: { fontFamily: 'Inter_500Medium', fontSize: 11 },
          tabBarStyle: { backgroundColor: tabBarBg, borderTopColor: tabBarBorder },
          sceneStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: 'Transactions',
            tabBarIcon: ({ color, size }) => <ArrowLeftRight color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="budgets"
          options={{
            title: 'Budgets',
            tabBarIcon: ({ color, size }) => <PieChart color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
          }}
        />
      </Tabs>
      <Fab />
    </>
  );
}
