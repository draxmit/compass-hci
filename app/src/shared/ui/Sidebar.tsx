import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeftRight, ChevronsLeft, ChevronsRight, Home, Lightbulb, PieChart, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthUser } from '@/stores/authStore';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { resolveAccent, usePageAccent } from '@/shared/hooks/usePageAccent';
import type { AccentKey } from '@/shared/theme/tokens';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { Text } from './Text';

type NavItem = {
  href: string;
  labelKey: 'dashboard' | 'transactions' | 'budgets' | 'insights';
  icon: React.ComponentType<{ color: string; size: number }>;
  accentKey: AccentKey;
};

// Primary nav — only the four main views. Profile/Settings live in the
// footer entry; Settings is reached from inside Profile.
const NAV: NavItem[] = [
  { href: '/',             labelKey: 'dashboard',    icon: Home,           accentKey: 'dashboard' },
  { href: '/transactions', labelKey: 'transactions', icon: ArrowLeftRight, accentKey: 'transactions' },
  { href: '/budgets',      labelKey: 'budgets',      icon: PieChart,       accentKey: 'budgets' },
  { href: '/insights',     labelKey: 'insights',     icon: Lightbulb,      accentKey: 'insights' },
];

/**
 * Desktop sidebar (≥1024px). Collapsible 64px ↔ 240px.
 *
 * Layout (top → bottom):
 *  - Header row: Logo (left) + Collapse toggle (right). When collapsed,
 *    only one icon shown — the collapse arrow alternates ←→.
 *  - "+ New transaction" CTA, accent-tinted.
 *  - Primary nav (Dashboard / Transactions / Budgets / Insights).
 *  - Spacer (flex-1).
 *  - Footer: Settings link, separated visually as a config entry rather
 *    than primary nav.
 */
export function Sidebar() {
  const { t } = useTranslation(['common']);
  const router = useRouter();
  const { resolvedScheme } = useTheme();
  const { key: activeAccentKey } = usePageAccent();
  const activeAccentColor = resolveAccent(activeAccentKey, resolvedScheme);
  const [collapsed, setCollapsed] = useState(false);
  const isDark = resolvedScheme === 'dark';
  const fgMutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const widthClass = collapsed ? 'w-16' : 'w-60';

  const profileActive = activeAccentKey === 'neutral';
  const profileAccent = resolveAccent('neutral', resolvedScheme);
  const user = useAuthUser();

  return (
    <View
      className={`${widthClass} h-full border-r border-surface-light-border dark:border-surface-dark-border px-3 py-5 flex-col`}
      style={{ transitionProperty: 'width', transitionDuration: '200ms' } as any}
    >
      {/* Header row: logo (left) + collapse toggle (right) */}
      <View className={`flex-row items-center mb-8 ${collapsed ? 'justify-center' : 'justify-between px-2'}`}>
        {!collapsed && (
          <View className="flex-row items-center gap-3">
            <Logo size={28} color={activeAccentColor} />
            <Text className="font-sans-bold text-lg text-surface-light-fg dark:text-surface-dark-fg">
              compass
            </Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? t('common:nav.expandSidebar') : t('common:nav.collapseSidebar')}
          onPress={() => setCollapsed((v) => !v)}
          hitSlop={6}
          className="w-9 h-9 items-center justify-center rounded-lg"
        >
          {collapsed ? (
            <ChevronsRight size={18} color={fgMutedColor} />
          ) : (
            <ChevronsLeft size={18} color={fgMutedColor} />
          )}
        </Pressable>
      </View>

      {/* Quick-entry CTA */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common:nav.newTransaction')}
        onPress={() => router.push('/transaction/new')}
        className={`flex-row items-center mb-6 rounded-xl border border-surface-light-border dark:border-surface-dark-border ${collapsed ? 'justify-center p-3' : 'gap-2 px-3 py-3'}`}
        style={{ backgroundColor: activeAccentColor + '14' }}
      >
        <Plus size={18} color={activeAccentColor} />
        {!collapsed && (
          <Text className="font-sans-medium text-sm" style={{ color: activeAccentColor }}>
            {t('common:nav.newTransaction')}
          </Text>
        )}
      </Pressable>

      {/* Primary nav */}
      <View className="gap-1">
        {NAV.map((item) => {
          const isActive = item.accentKey === activeAccentKey;
          const accent = resolveAccent(item.accentKey, resolvedScheme);
          const iconColor = isActive ? accent : fgMutedColor;
          const label = t(`common:nav.${item.labelKey}`);
          return (
            <Pressable
              key={item.href}
              accessibilityRole="link"
              accessibilityLabel={label}
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
                  {label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Spacer pushes footer to the bottom */}
      <View className="flex-1" />

      {/* Footer: Profile (avatar + name). Settings is reachable from /profile. */}
      <View className="border-t border-surface-light-border dark:border-surface-dark-border pt-3">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('common:nav.openProfile')}
          accessibilityState={{ selected: profileActive }}
          onPress={() => router.navigate('/profile' as never)}
          className={`flex-row items-center rounded-xl ${collapsed ? 'justify-center p-2' : 'gap-3 px-2 py-2'}`}
          style={{ backgroundColor: profileActive ? profileAccent + '1f' : 'transparent' }}
        >
          <Avatar
            photoURL={user?.photoURL ?? null}
            displayName={user?.displayName ?? null}
            email={user?.email ?? null}
            size={32}
          />
          {!collapsed && (
            <View className="flex-1">
              <Text
                className="font-sans-medium text-sm"
                style={profileActive ? { color: profileAccent } : { color: undefined }}
                numberOfLines={1}
              >
                {user?.displayName ?? user?.email?.split('@')[0] ?? 'You'}
              </Text>
              {user?.email ? (
                <Text
                  className="font-sans text-xs"
                  style={{ color: fgMutedColor }}
                  numberOfLines={1}
                >
                  {user.email}
                </Text>
              ) : null}
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}
