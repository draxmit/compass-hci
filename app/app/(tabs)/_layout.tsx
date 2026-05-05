import { Tabs } from 'expo-router';
import { ArrowLeftRight, Home, Menu, PieChart } from 'lucide-react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { usePageAccent } from '@/shared/hooks/usePageAccent';
import { Fab } from '@/shared/ui/Fab';

/**
 * Bottom-tabs layout for mobile. 4 tabs (Insights moved to root /insights
 * stack route, reachable from sidebar on desktop or More menu on mobile),
 * with a center FAB for quick transaction entry above the tab bar.
 *
 * Hidden on desktop — sidebar provides nav there.
 */
export default function TabsLayout() {
  const { resolvedScheme } = useTheme();
  const { color: activeColor } = usePageAccent();
  const isDesktop = useIsDesktop();
  const isDark = resolvedScheme === 'dark';

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
          tabBarStyle: isDesktop
            ? { display: 'none' }
            : { backgroundColor: tabBarBg, borderTopColor: tabBarBorder },
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
        {/* Insights moved out of bottom tabs — reachable via Sidebar on desktop
            or via More tab → Insights link on mobile. */}
      </Tabs>
      {!isDesktop && <Fab />}
    </>
  );
}
