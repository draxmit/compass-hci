import { Slot, Tabs } from 'expo-router';
import { ArrowLeftRight, Home, Lightbulb, PieChart } from 'lucide-react-native';

import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { CustomTabBar } from '@/shared/ui/CustomTabBar';
import { MobileTopBar } from '@/shared/ui/MobileTopBar';

/**
 * Adaptive tabs layout.
 *
 * On mobile: bottom tabs rendered via <CustomTabBar/> with 5 evenly-spaced
 * cells — Dashboard / Transactions / [+ FAB] / Budgets / Insights. The FAB
 * occupies a real cell instead of floating between two tabs, so the
 * neighbour icons sit a full cell-width away. Settings + sign-out live in
 * /profile → /settings, reachable from the avatar in <MobileTopBar/>.
 *
 * On desktop: <Slot/> renders the active child route directly with no Tabs
 * navigator chrome — Sidebar provides navigation. Without this, the Tabs
 * scene container would stack visited screens on top of each other when the
 * bottom tab bar is hidden via `display: 'none'` (React Navigation v7 has no
 * `unmountOnBlur` option for Bottom Tabs).
 */
export default function TabsLayout() {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <Slot />;
  }

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        header: () => <MobileTopBar />,
        sceneStyle: { backgroundColor: 'transparent' },
        // Pre-mount all four tabs at app start. Default lazy mount caused a
        // one-frame flash on first visit to each tab as the screen tree was
        // built. Eager mount trades a slightly heavier cold-start for instant
        // tab switches throughout the session. We also set lazy:false per
        // Tabs.Screen because expo-router 4 has historically been finicky
        // about which level of options is honoured for native-stack tabs.
        lazy: false,
        freezeOnBlur: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          lazy: false,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => <ArrowLeftRight color={color} size={size} />,
          lazy: false,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, size }) => <PieChart color={color} size={size} />,
          lazy: false,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, size }) => <Lightbulb color={color} size={size} />,
          lazy: false,
        }}
      />
    </Tabs>
  );
}
