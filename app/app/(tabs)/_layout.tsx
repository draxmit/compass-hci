import { Slot, Tabs } from 'expo-router';
import { ArrowLeftRight, Home, Lightbulb, PieChart } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { CustomTabBar } from '@/shared/ui/CustomTabBar';
import { MobileTopBar } from '@/shared/ui/MobileTopBar';

// Platform-conditional lazy/freezeOnBlur:
//   - Native: lazy:false + freezeOnBlur:false → all tabs eager-mounted
//     and never frozen, so switches are instant with no one-frame
//     flash (this was the original goal back in T2).
//   - Web: lazy:true + freezeOnBlur:true → only the active tab is
//     mounted/visible; inactive tabs get display:none via React
//     Navigation. Without these, all four tab screens render stacked
//     on top of each other at <1024px widths because RN-Web doesn't
//     auto-hide inactive screens when freezeOnBlur is false.
const TAB_LAZY = Platform.OS === 'web';
const TAB_FREEZE_ON_BLUR = Platform.OS === 'web';

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
  const { t } = useTranslation(['common']);
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <Slot />;
  }

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        header: (props) => <MobileTopBar {...props} />,
        sceneStyle: { backgroundColor: 'transparent' },
        // See TAB_LAZY / TAB_FREEZE_ON_BLUR above for the platform split.
        // We also set lazy per Tabs.Screen because expo-router 4 has
        // historically been finicky about which level of options is
        // honoured for native-stack tabs.
        lazy: TAB_LAZY,
        freezeOnBlur: TAB_FREEZE_ON_BLUR,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('common:nav.dashboard'),
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          lazy: TAB_LAZY,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t('common:nav.transactions'),
          tabBarIcon: ({ color, size }) => <ArrowLeftRight color={color} size={size} />,
          lazy: TAB_LAZY,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: t('common:nav.budgets'),
          tabBarIcon: ({ color, size }) => <PieChart color={color} size={size} />,
          lazy: TAB_LAZY,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('common:nav.insights'),
          tabBarIcon: ({ color, size }) => <Lightbulb color={color} size={size} />,
          lazy: TAB_LAZY,
        }}
      />
    </Tabs>
  );
}
