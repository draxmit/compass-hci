import { useRouter, useSegments } from 'expo-router';
import { ArrowLeftRight, Home, Lightbulb, PieChart, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUserDoc } from '@/stores/authStore';
import { resolveAccent, usePageAccent } from '@/shared/hooks/usePageAccent';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { QuickPresetMenu } from './QuickPresetMenu';
import { Text } from './Text';

/**
 * Web-only tab bar — drops the React Navigation dependency entirely.
 *
 * Why a separate component vs reusing CustomTabBar:
 *   The original CustomTabBar is wired into React Navigation's
 *   <Tabs/> navigator and receives BottomTabBarProps (state,
 *   descriptors, navigation). On native that's fine — Tabs manages
 *   the screen-stacking correctly with display:none on inactive tabs.
 *   On WEB, RN-Web's BottomTabsNavigator does NOT reliably apply
 *   display:none to inactive tabs even with freezeOnBlur:true (we
 *   tried, see commit 2057cb2). All four screens render stacked.
 *
 *   Workaround in (tabs)/_layout.tsx: use <Slot/> on web (which
 *   only renders the active route) + this component as the bottom
 *   chrome. Self-contained: derives the active tab from
 *   useSegments() and navigates via router.push().
 *
 * Layout matches CustomTabBar exactly (5 cells, FAB in cell 3) so
 * the visual treatment is consistent across web and native.
 */

const TAB_BAR_HEIGHT = 56;

type TabSpec = {
  segment: 'index' | 'transactions' | 'budgets' | 'insights';
  pathname: '/' | '/transactions' | '/budgets' | '/insights';
  labelKey: 'dashboard' | 'transactions' | 'budgets' | 'insights';
  icon: React.ComponentType<{ color: string; size: number }>;
};

const TABS: readonly TabSpec[] = [
  { segment: 'index',        pathname: '/',             labelKey: 'dashboard',    icon: Home },
  { segment: 'transactions', pathname: '/transactions', labelKey: 'transactions', icon: ArrowLeftRight },
  { segment: 'budgets',      pathname: '/budgets',      labelKey: 'budgets',      icon: PieChart },
  { segment: 'insights',     pathname: '/insights',     labelKey: 'insights',     icon: Lightbulb },
];

export function WebMobileTabBar() {
  const { t } = useTranslation(['common']);
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const { color: activeAccent } = usePageAccent();
  const isDark = resolvedScheme === 'dark';

  const userDoc = useUserDoc();
  const presets = userDoc?.quickPresets ?? [];
  const [menuOpen, setMenuOpen] = useState(false);

  const inactiveColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const tabBarBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const tabBarBorder = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  // Active tab: segments[1] is the screen name within (tabs).
  // expo-router uses 'index' for the unnamed root tab screen.
  const activeSegment = (segments[1] ?? 'index') as TabSpec['segment'];
  const activeTab = TABS.find((tx) => tx.segment === activeSegment) ?? TABS[0]!;
  const fromPath = activeTab.pathname;

  return (
    <>
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
        {/* Render the 5 cells: Dashboard, Transactions, FAB, Budgets, Insights. */}
        {[TABS[0], TABS[1], 'fab', TABS[2], TABS[3]].map((entry, idx) => {
          if (entry === 'fab') {
            return (
              <View
                key="fab"
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common:nav.newTransaction')}
                  accessibilityHint={t('common:nav.fabLongPressHint')}
                  onPress={() =>
                    router.push({
                      pathname: '/transaction/new',
                      params: { from: fromPath },
                    })
                  }
                  onLongPress={() => setMenuOpen(true)}
                  delayLongPress={400}
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

          const tab = entry as TabSpec;
          const isFocused = tab.segment === activeSegment;
          const cellColor = isFocused
            ? resolveAccent(tab.labelKey, resolvedScheme)
            : inactiveColor;
          const Icon = tab.icon;

          return (
            <Pressable
              key={tab.segment}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={t(`common:nav.${tab.labelKey}`)}
              onPress={() => router.push(tab.pathname)}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              {/* Top accent pill — pinned to the cell's top edge,
                  same treatment as CustomTabBar. */}
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  marginLeft: -12,
                  width: 24,
                  height: 3,
                  borderBottomLeftRadius: 2,
                  borderBottomRightRadius: 2,
                  backgroundColor: isFocused ? cellColor : 'transparent',
                }}
              />
              <Icon color={cellColor} size={18} />
              <Text
                style={{
                  color: cellColor,
                  fontSize: 10,
                  fontFamily: 'Inter_500Medium',
                  marginTop: 2,
                }}
              >
                {t(`common:nav.${tab.labelKey}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <QuickPresetMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        presets={presets}
        fromPath={fromPath}
      />
    </>
  );
}
