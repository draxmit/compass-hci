import { Alert, BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, Pencil, Settings as SettingsIcon, Sparkles, Tag, Wallet, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { auth, updateDisplayName } from '@/services/firebase';
import { useAuthUser } from '@/stores/authStore';
import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Avatar } from '@/shared/ui/Avatar';
import { Card } from '@/shared/ui/Card';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatDate } from '@/shared/utils/formatDate';

// /profile is the primary identity screen. Reached via Sidebar footer
// (desktop) or the avatar in MobileTopBar (mobile). Settings is reached
// from a link card inside this screen.
export default function ProfileScreen() {
  const { t } = useTranslation(['settings', 'common', 'categories', 'accounts']);
  const { resolvedScheme } = useTheme();
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const user = useAuthUser();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [createdAt, setCreatedAt] = useState<Date | null>(null);
  const isDark = resolvedScheme === 'dark';

  // Sync draft when user changes externally (e.g. after auth event).
  useEffect(() => {
    setDraft(user?.displayName ?? '');
  }, [user?.displayName]);

  // Read createdAt from Firebase Auth metadata (no Firestore round-trip).
  useEffect(() => {
    const cur = auth.currentUser;
    const ts = cur?.metadata?.creationTime;
    if (ts) setCreatedAt(new Date(ts));
  }, [user?.uid]);

  // We reached /profile via router.replace (see MobileTopBar) so the Stack
  // is empty behind us — Android's hardware back would exit the app. Route
  // it back to Dashboard instead. No-op on web/iOS where BackHandler is
  // not active.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false;
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark
    ? tokens.surface['dark-fg-muted']
    : tokens.surface['light-fg-muted'];
  const sectionLabelClass = 'font-sans-medium text-xs uppercase tracking-wider mb-3';

  const memberSinceLabel = createdAt ? formatDate(createdAt, 'long') : '—';
  const daysUsing = createdAt ? Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000) + 1) : null;

  const handleSaveName = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      await updateDisplayName(draft);
      setEditing(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings:profile.errors.updateNameFallback');
      Alert.alert(t('settings:profile.errors.updateNameTitle'), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setDraft(user?.displayName ?? '');
    setEditing(false);
  };

  // Opaque wrapper using an inline backgroundColor (not NativeWind className) so
  // the bg paints synchronously on first render — NativeWind's runtime class
  // compilation can lag a frame, briefly exposing the (tabs) screen below.
  // Defence-in-depth: the Stack screen wrapper also has contentStyle bg.
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48, paddingBottom: 24 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="self-center w-full max-w-md">
        {!isDesktop && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={8}
            className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
          >
            <ChevronLeft size={22} color={fgColor} />
            <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
              {t('common:actions.back')}
            </Text>
          </Pressable>
        )}

        <Text className="font-sans-bold text-3xl mb-1">{t('settings:profile.title')}</Text>
        <Text className="font-sans text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-8">
          {t('settings:profile.tagline')}
        </Text>

      {/* Identity card */}
      {user ? (
        <Card padding="lg" className="mb-4 w-full max-w-md">
          <Text className={sectionLabelClass} style={{ color: mutedColor }}>
            {t('settings:profile.section.identity')}
          </Text>
          <View className="flex-row items-center mb-5">
            <Avatar
              photoURL={user.photoURL}
              displayName={user.displayName}
              email={user.email}
              size={64}
            />
            <View className="ml-4 flex-1">
              {editing ? (
                <View>
                  <TextField
                    label={t('settings:profile.section.identity')}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={user?.displayName ?? ''}
                    autoCapitalize="words"
                    autoComplete="name"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />
                  <View className="flex-row gap-2 mt-3">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('settings:profile.actions.saveName')}
                      disabled={saving || !draft.trim()}
                      onPress={handleSaveName}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 10,
                        borderRadius: 10,
                        backgroundColor: tokens.accent.dashboard,
                        opacity: saving || !draft.trim() ? 0.5 : 1,
                        minHeight: 44,
                      }}
                    >
                      <Check size={16} color="#fff" />
                      <Text className="font-sans-medium text-white text-sm">
                        {saving ? t('common:actions.saving') : t('common:actions.save')}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('settings:profile.actions.cancelEdit')}
                      onPress={handleCancelEdit}
                      disabled={saving}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isDark
                          ? tokens.surface['dark-border']
                          : tokens.surface['light-border'],
                        minHeight: 44,
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      <X size={16} color={fgColor} />
                      <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                        {t('common:actions.cancel')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View className="flex-row items-center">
                  <Text
                    className="font-sans-semibold text-lg flex-shrink"
                    numberOfLines={1}
                  >
                    {user.displayName ?? user.email?.split('@')[0] ?? t('settings:profile.you')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('settings:profile.actions.editName')}
                    onPress={() => setEditing(true)}
                    hitSlop={8}
                    className="ml-2 w-9 h-9 items-center justify-center rounded-lg"
                  >
                    <Pencil size={16} color={mutedColor} />
                  </Pressable>
                </View>
              )}
              {!editing && (
                <Text
                  className="font-sans text-sm mt-0.5"
                  style={{ color: mutedColor }}
                  numberOfLines={1}
                >
                  {user.email}
                </Text>
              )}
            </View>
          </View>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'],
              paddingTop: 16,
            }}
          >
            <View className="flex-row items-baseline justify-between mb-2">
              <Text className="font-sans text-sm" style={{ color: mutedColor }}>
                {t('settings:profile.memberSince')}
              </Text>
              <Text className="font-sans-medium text-sm">{memberSinceLabel}</Text>
            </View>
            <View className="flex-row items-baseline justify-between">
              <Text className="font-sans text-sm" style={{ color: mutedColor }}>
                {t('settings:profile.daysUsing')}
              </Text>
              <Text className="font-sans-medium text-sm">
                {daysUsing != null ? t('settings:profile.daysUsing', { count: daysUsing, context: daysUsing === 1 ? 'one' : 'other' }) : '—'}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {/* Activity stats card */}
      <Card padding="lg" className="mb-4 w-full max-w-md">
        <Text className={sectionLabelClass} style={{ color: mutedColor }}>
          {t('settings:profile.section.activity')}
        </Text>
        <View className="flex-row items-baseline justify-between">
          <Text className="font-sans text-sm" style={{ color: mutedColor }}>
            {t('settings:profile.transactionsLogged')}
          </Text>
          <Text className="font-mono tabular-nums text-base font-sans-semibold">0</Text>
        </View>
        <Text
          className="font-sans text-xs mt-3"
          style={{ color: mutedColor }}
        >
          {t('settings:profile.noTransactionsYet')}
        </Text>
      </Card>

      {/* Achievements placeholder */}
      <Card padding="lg" className="mb-4 w-full max-w-md">
        <View className="flex-row items-center mb-2">
          <Sparkles size={16} color={tokens.accent.insights} />
          <Text
            className={`${sectionLabelClass.replace('mb-3', 'mb-0')} ml-2`}
            style={{ color: mutedColor }}
          >
            {t('settings:profile.section.achievements')}
          </Text>
        </View>
        <Text className="font-sans text-sm" style={{ color: mutedColor }}>
          {t('settings:profile.achievementsBlurb')}
        </Text>
      </Card>

      {/* Accounts link — your money lives here. */}
      <Card padding="none" className="mb-4 w-full max-w-md">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('accounts:title')}
          onPress={() => router.push('/accounts')}
          className="flex-row items-center px-5 py-4 min-h-[44px]"
        >
          <Wallet size={20} color={mutedColor} />
          <View className="ml-3 flex-1">
            <Text className="font-sans-medium">{t('accounts:title')}</Text>
            <Text className="font-sans text-xs" style={{ color: mutedColor }}>
              {t('accounts:tagline')}
            </Text>
          </View>
          <ChevronRight size={18} color={mutedColor} />
        </Pressable>
      </Card>

      {/* Categories link — your data lives in Profile, not Settings. */}
      <Card padding="none" className="mb-4 w-full max-w-md">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('categories:title')}
          onPress={() => router.push('/categories')}
          className="flex-row items-center px-5 py-4 min-h-[44px]"
        >
          <Tag size={20} color={mutedColor} />
          <View className="ml-3 flex-1">
            <Text className="font-sans-medium">{t('categories:title')}</Text>
            <Text className="font-sans text-xs" style={{ color: mutedColor }}>
              {t('categories:tagline')}
            </Text>
          </View>
          <ChevronRight size={18} color={mutedColor} />
        </Pressable>
      </Card>

      {/* Settings link */}
      <Card padding="none" className="w-full max-w-md">
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('settings:profile.settingsLink')}
          onPress={() => router.push('/settings')}
          className="flex-row items-center px-5 py-4 min-h-[44px]"
        >
          <SettingsIcon size={20} color={mutedColor} />
          <View className="ml-3 flex-1">
            <Text className="font-sans-medium">{t('settings:profile.settingsLink')}</Text>
            <Text className="font-sans text-xs" style={{ color: mutedColor }}>
              {t('settings:profile.settingsLinkDescription')}
            </Text>
          </View>
          <ChevronRight size={18} color={mutedColor} />
        </Pressable>
      </Card>
        </View>
      </ScrollView>
    </View>
  );
}
