import { Slot, Tabs } from 'expo-router';
import { ArrowLeftRight, Home, Lightbulb, PieChart } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { CustomTabBar } from '@/shared/ui/CustomTabBar';
import { MobileTopBar } from '@/shared/ui/MobileTopBar';
import { WebMobileTabBar } from '@/shared/ui/WebMobileTabBar';

/**
 * Adaptive tabs layout — three modes:
 *
 *   1. Desktop web (≥1024px): just <Slot/>. Sidebar provides navigation;
 *      no bottom tabs needed. Active route renders alone (Slot's
 *      semantics — only the matching child is mounted).
 *
 *   2. Mobile / tablet WEB (<1024px): <Slot/> + <WebMobileTabBar/>.
 *      Slot still only renders the active route. The custom web tab
 *      bar at the bottom uses useSegments() + router.push() to
 *      navigate. We DON'T use the React Navigation <Tabs/> navigator
 *      on web because RN-Web's bottom-tabs implementation doesn't
 *      reliably hide inactive tabs via display:none — we tried both
 *      lazy:true + freezeOnBlur:true at screenOptions and per-screen
 *      levels (commits 34c2f3d, 2057cb2) and four screens still
 *      stacked at narrow widths.
 *
 *   3. NATIVE (iOS / Android): real <Tabs/> navigator. Native handles
 *      screen-stacking and gesture transitions correctly. lazy:false
 *      + freezeOnBlur:false keep instant tab switches with no flash.
 */
export default function TabsLayout() {
  const { t } = useTranslation(['common']);
  const isDesktop = useIsDesktop();
  const isWeb = Platform.OS === 'web';

  // Desktop web: Sidebar handles nav, just render the active route.
  if (isWeb && isDesktop) {
    return <Slot />;
  }

  // Mobile / tablet web: top bar + active route + custom bottom tab bar.
  // Flex column: top bar fixed-height, content fills middle, bar at bottom.
  if (isWeb) {
    return (
      <View style={{ flex: 1 }}>
        <MobileTopBar />
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
        <WebMobileTabBar />
      </View>
    );
  }

  // Native: real Tabs navigator with header + custom bar.
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        header: (props) => <MobileTopBar {...props} />,
        sceneStyle: { backgroundColor: 'transparent' },
        // Native: eager-mount + no-freeze for instant tab switches with
        // no one-frame flash on first visit.
        lazy: false,
        freezeOnBlur: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('common:nav.dashboard'),
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          lazy: false,
          freezeOnBlur: false,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t('common:nav.transactions'),
          tabBarIcon: ({ color, size }) => <ArrowLeftRight color={color} size={size} />,
          lazy: false,
          freezeOnBlur: false,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: t('common:nav.budgets'),
          tabBarIcon: ({ color, size }) => <PieChart color={color} size={size} />,
          lazy: false,
          freezeOnBlur: false,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('common:nav.insights'),
          tabBarIcon: ({ color, size }) => <Lightbulb color={color} size={size} />,
          lazy: false,
          freezeOnBlur: false,
        }}
      />
    </Tabs>
  );
}
