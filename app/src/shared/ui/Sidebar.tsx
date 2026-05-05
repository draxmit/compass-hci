import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeftRight, ChevronsLeft, ChevronsRight, Home, Lightbulb, Menu, PieChart, Plus } from 'lucide-react-native';
import { useState } from 'react';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { resolveAccent, usePageAccent } from '@/shared/hooks/usePageAccent';
import type { AccentKey } from '@/shared/theme/tokens';
import { Logo } from './Logo';
import { Text } from './Text';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ color: string; size: number }>;
  accentKey: AccentKey;
};

const NAV: NavItem[] = [
  // Use clean URLs (no group prefix). Expo Router 6 resolves these through
  // the (tabs) group's Tabs navigator, which is what triggers a proper
  // active-screen swap (vs router.replace on a group prefix which can leave
  // the previous screen mounted on top).
  { href: '/',             label: 'Dashboard',    icon: Home,           accentKey: 'dashboard' },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight, accentKey: 'transactions' },
  { href: '/budgets',      label: 'Budgets',      icon: PieChart,       accentKey: 'budgets' },
  { href: '/insights',     label: 'Insights',     icon: Lightbulb,      accentKey: 'insights' },
  { href: '/more',         label: 'More',         icon: Menu,           accentKey: 'neutral' },
];

/**
 * Desktop sidebar (≥1024px). Collapsible 64px ↔ 240px. Active item gets
 * its page accent color. Compass logo at top, "+ New transaction" CTA above
 * nav, collapse toggle at bottom.
 */
export function Sidebar() {
  const router = useRouter();
  const { resolvedScheme } = useTheme();
  const { key: activeAccentKey } = usePageAccent();
  const activeAccentColor = resolveAccent(activeAccentKey, resolvedScheme);
  const [collapsed, setCollapsed] = useState(false);
  const isDark = resolvedScheme === 'dark';
  const fgMutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const widthClass = collapsed ? 'w-16' : 'w-60';

  return (
    <View
      className={`${widthClass} h-full border-r border-surface-light-border dark:border-surface-dark-border px-3 py-5 flex-col justify-between`}
      style={{ transitionProperty: 'width', transitionDuration: '200ms' } as any}
    >
      {/* Top: logo + new-transaction CTA + nav */}
      <View>
        <View className={`flex-row items-center mb-8 ${collapsed ? 'justify-center' : 'gap-3 px-2'}`}>
          <Logo size={28} color={activeAccentColor} />
          {!collapsed && (
            <Text className="font-sans-bold text-lg text-surface-light-fg dark:text-surface-dark-fg">
              compass
            </Text>
          )}
        </View>

        {/* Quick-entry CTA */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New transaction"
          onPress={() => {
            // T6 wires the actual quick-entry sheet
          }}
          className={`flex-row items-center mb-6 rounded-xl border border-surface-light-border dark:border-surface-dark-border ${collapsed ? 'justify-center p-3' : 'gap-2 px-3 py-3'}`}
          style={{ backgroundColor: activeAccentColor + '14' }}
        >
          <Plus size={18} color={activeAccentColor} />
          {!collapsed && (
            <Text className="font-sans-medium text-sm" style={{ color: activeAccentColor }}>
              New transaction
            </Text>
          )}
        </Pressable>

        {/* Nav items */}
        <View className="gap-1">
          {NAV.map((item) => {
            const isActive = item.accentKey === activeAccentKey;
            const accent = resolveAccent(item.accentKey, resolvedScheme);
            const iconColor = isActive ? accent : fgMutedColor;
            return (
              <Pressable
                key={item.href}
                accessibilityRole="link"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: isActive }}
                onPress={() => router.navigate(item.href as never)}
                className={`flex-row items-center rounded-xl ${collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'}`}
                style={{ backgroundColor: isActive ? accent + '1f' : 'transparent' }}
              >
                <item.icon size={18} color={iconColor} />
                {!collapsed && (
                  <Text
                    className={`font-sans-medium text-sm ${isActive ? '' : 'text-surface-light-fg-muted dark:text-surface-dark-fg-muted'}`}
                    style={isActive ? { color: accent } : undefined}
                  >
                    {item.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Bottom: collapse toggle */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        onPress={() => setCollapsed((v) => !v)}
        className={`flex-row items-center rounded-xl ${collapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5'}`}
      >
        {collapsed ? <ChevronsRight size={16} color={fgMutedColor} /> : <ChevronsLeft size={16} color={fgMutedColor} />}
        {!collapsed && (
          <Text className="font-sans-medium text-xs text-surface-light-fg-muted dark:text-surface-dark-fg-muted">
            Collapse
          </Text>
        )}
      </Pressable>
    </View>
  );
}
