import type { Account, Goal } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import {
  Check, ChevronLeft, Pin, PinOff, Plus, Sparkles, Trash2, X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { updateUserDoc } from '@/services/firebase';
import { subscribeAccounts } from '@/services/firestore/accountsService';
import {
  contributeGoal, createGoal, deleteGoal, subscribeGoals,
} from '@/services/firestore/goalsService';
import { useAuthUser, useUserDoc } from '@/stores/authStore';
import { GOAL_TEMPLATES, getTemplate } from '@/shared/data/goalTemplates';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { DateField } from '@/shared/ui/DateField';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatAmountInput, minorToInputText, parseAmountInput } from '@/shared/utils/amountInput';
import { formatDate, formatTimeUntil } from '@/shared/utils/formatDate';
import { formatIDR } from '@/shared/utils/formatIDR';

/**
 * /goals — sinking-fund list + add / contribute / delete (ADR-15).
 *
 * Modal-style fullScreenModal Stack route, registered in
 * app/_layout.tsx. Reached from Profile → Goals card link or from
 * Dashboard goal pill tap.
 *
 * v2 launch ships sinking funds only. Habit streaks deferred.
 */
export default function GoalsScreen() {
  const { t, i18n } = useTranslation(['goals', 'common']);
  const router = useRouter();
  const appAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const userDoc = useUserDoc();
  const pinnedGoalId = userDoc?.pinnedGoalId ?? null;
  const wid = user ? `solo-${user.uid}` : null;

  const handleTogglePin = (goalId: string) => {
    if (!user) return;
    const next = pinnedGoalId === goalId ? null : goalId;
    void updateUserDoc(user.uid, { pinnedGoalId: next }).catch((err: unknown) => {
      console.warn('[goals] pin write failed', err);
    });
  };

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const accent = tokens.accent.dashboard;

  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Add-goal panel state. When non-null, the screen swaps from list
  // view to the add form (matches the Categories / Accounts inline
  // panel pattern from T4/T5).
  const [adding, setAdding] = useState<{ templateKey: string | null } | null>(null);

  // Contribute-modal state — which goal is currently receiving a
  // contribution. Inline expansion of the goal row rather than a
  // separate modal (per ADR-15 §7).
  const [contributingId, setContributingId] = useState<string | null>(null);

  useEffect(() => {
    if (!wid) return;
    const unsub = subscribeGoals(wid, (g) => {
      setGoals(g);
      setLoaded(true);
    });
    const unsubA = subscribeAccounts(wid, setAccounts);
    return () => { unsub(); unsubA(); };
  }, [wid]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (adding) {
        setAdding(null);
        return true;
      }
      if (router.canGoBack()) return false;
      router.replace('/profile');
      return true;
    });
    return () => sub.remove();
  }, [router, adding]);

  if (adding) {
    return (
      <GoalEditPanel
        wid={wid}
        templateKey={adding.templateKey}
        onClose={() => setAdding(null)}
        isDark={isDark}
        lang={lang}
        fgColor={fgColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
        overlayBg={overlayBg}
        appAlert={appAlert}
        t={t}
        insets={insets}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingTop: 48,
          paddingBottom: 24 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="self-center w-full max-w-md lg:max-w-3xl">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('common:actions.back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
            hitSlop={8}
            className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
          >
            <ChevronLeft size={22} color={fgColor} />
            <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
              {t('common:actions.back')}
            </Text>
          </Pressable>

          <View className="flex-row items-center justify-between mb-1">
            <Text className="font-sans-bold text-3xl" style={{ color: fgColor }}>
              {t('goals:title')}
            </Text>
            {goals.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('goals:addCta')}
                onPress={() => setAdding({ templateKey: null })}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: accent,
                  minHeight: 36,
                }}
              >
                <Plus size={14} color="#fff" />
                <Text className="font-sans-medium text-white text-xs">
                  {t('goals:addCta')}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text className="font-sans text-sm mb-6" style={{ color: mutedColor }}>
            {t('goals:subtitle')}
          </Text>

          {/* Empty-state — friendly card with template-row preview + CTA */}
          {loaded && goals.length === 0 ? (
            <View>
              <Card padding="lg" className="items-center mb-6">
                <View
                  style={{
                    width: 56, height: 56, borderRadius: 14,
                    backgroundColor: accent + '22',
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <Sparkles size={28} color={accent} strokeWidth={2.2} />
                </View>
                <Text className="font-sans-bold text-2xl text-center" style={{ color: fgColor }}>
                  {t('goals:empty.title')}
                </Text>
                <Text
                  className="font-sans text-sm text-center mt-3 mb-6"
                  style={{ color: mutedColor, lineHeight: 20 }}
                >
                  {t('goals:empty.body')}
                </Text>
              </Card>
              <Text
                className="font-sans-medium text-xs uppercase tracking-wider mb-3"
                style={{ color: mutedColor }}
              >
                {t('goals:templates.label')}
              </Text>
              <Card padding="none">
                {GOAL_TEMPLATES.map((tpl, idx) => {
                  const tint = resolveCategoryColor(tpl.color, isDark ? 'dark' : 'light');
                  return (
                    <Pressable
                      key={tpl.key}
                      accessibilityRole="button"
                      accessibilityLabel={t(`goals:templates.${tpl.key}`)}
                      onPress={() => setAdding({ templateKey: tpl.key })}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderTopWidth: idx > 0 ? 1 : 0,
                        borderTopColor: borderColor,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          width: 36, height: 36, borderRadius: 10,
                          backgroundColor: tint + '22',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <CategoryIcon name={tpl.icon} color={tint} size={18} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                          {t(`goals:templates.${tpl.key}`)}
                        </Text>
                        <Text className="font-mono tabular-nums text-xs mt-0.5" style={{ color: mutedColor }}>
                          {t('goals:templates.suggestedTarget', {
                            amount: formatIDR(tpl.suggestedTargetMinor, lang),
                          })}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
                {/* Custom row */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('goals:templates.custom')}
                  onPress={() => setAdding({ templateKey: null })}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderTopWidth: 1,
                    borderTopColor: borderColor,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: borderColor,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Plus size={18} color={fgColor} />
                  </View>
                  <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }}>
                    {t('goals:templates.custom')}
                  </Text>
                </Pressable>
              </Card>
            </View>
          ) : null}

          {/* Goal list */}
          {loaded && goals.length > 0 ? (
            <View style={{ gap: 12 }}>
              {goals.map((g) => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  wid={wid}
                  accounts={accounts}
                  isDark={isDark}
                  lang={lang}
                  fgColor={fgColor}
                  mutedColor={mutedColor}
                  borderColor={borderColor}
                  accent={accent}
                  isPinned={pinnedGoalId === g.id}
                  onTogglePin={() => handleTogglePin(g.id)}
                  isContributing={contributingId === g.id}
                  onToggleContribute={() =>
                    setContributingId((cur) => (cur === g.id ? null : g.id))
                  }
                  onDelete={() => {
                    appAlert(
                      t('goals:delete.title'),
                      t('goals:delete.body'),
                      [
                        { text: t('common:actions.cancel'), style: 'cancel' },
                        {
                          text: t('goals:delete.confirm'),
                          style: 'destructive',
                          onPress: async () => {
                            if (!wid) return;
                            try {
                              await deleteGoal(wid, g.id);
                            } catch (err) {
                              const msg = err instanceof Error ? err.message : t('goals:delete.failed');
                              appAlert(t('goals:title'), msg);
                            }
                          },
                        },
                      ],
                    );
                  }}
                  appAlert={appAlert}
                  t={t}
                />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

// ---------- GoalRow ----------

type GoalRowProps = {
  goal: Goal;
  wid: string | null;
  accounts: Account[];
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  accent: string;
  isPinned: boolean;
  onTogglePin: () => void;
  isContributing: boolean;
  onToggleContribute: () => void;
  onDelete: () => void;
  appAlert: ReturnType<typeof useAppAlert>;
  t: ReturnType<typeof useTranslation>['t'];
};

function GoalRow({
  goal, wid, accounts, isDark, lang, fgColor, mutedColor, borderColor, accent,
  isPinned, onTogglePin, isContributing, onToggleContribute, onDelete, appAlert, t,
}: GoalRowProps) {
  const tpl = getTemplate(goal.templateKey);
  const iconKey = tpl?.icon ?? 'wallet';
  const colorKey = tpl?.color ?? 'teal';
  const tint = resolveCategoryColor(colorKey, isDark ? 'dark' : 'light');

  const ratio = goal.targetMinor === 0 ? 0 : goal.currentMinor / goal.targetMinor;
  const fillRatio = Math.min(ratio, 1);
  const percent = `${Math.round(ratio * 100)}%`;
  const reached = ratio >= 1;

  const [contribText, setContribText] = useState('');
  const [contribAccountId, setContribAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleContribute = async () => {
    if (!wid || saving) return;
    const amount = parseAmountInput(contribText, lang);
    if (amount <= 0) {
      appAlert(t('goals:contribute.title', { goalName: goal.name }), t('goals:contribute.errors.missingAmount'));
      return;
    }
    if (!contribAccountId) {
      appAlert(t('goals:contribute.title', { goalName: goal.name }), t('goals:contribute.errors.missingAccount'));
      return;
    }
    setSaving(true);
    try {
      await contributeGoal(wid, goal.id, contribAccountId, amount);
      setContribText('');
      setContribAccountId(null);
      onToggleContribute();   // collapse
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('goals:contribute.errors.saveFailed');
      appAlert(t('goals:title'), msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="lg">
      <View className="flex-row items-center" style={{ gap: 12, marginBottom: 12 }}>
        <View
          style={{
            width: 40, height: 40, borderRadius: 10,
            backgroundColor: tint + '22',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <CategoryIcon name={iconKey} color={tint} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text className="font-sans-semibold text-base" style={{ color: fgColor }} numberOfLines={1}>
            {goal.name}
          </Text>
          <Text className="font-mono tabular-nums text-xs mt-0.5" style={{ color: mutedColor }}>
            {t('goals:row.ofTarget', {
              current: formatIDR(goal.currentMinor, lang),
              target: formatIDR(goal.targetMinor, lang),
            })}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: isPinned }}
          accessibilityLabel={isPinned
            ? t('goals:row.unpin')
            : t('goals:row.pin')}
          onPress={onTogglePin}
          hitSlop={8}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: isPinned ? accent + '22' : 'transparent',
          }}
        >
          {isPinned ? (
            <Pin size={14} color={accent} fill={accent} />
          ) : (
            <PinOff size={14} color={mutedColor} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('goals:row.delete')}
          onPress={onDelete}
          hitSlop={8}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Trash2 size={14} color={mutedColor} />
        </Pressable>
      </View>

      {/* Progress bar */}
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: borderColor,
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <LinearGradient
          colors={
            reached
              ? [tokens.semantic.positive + 'b3', tokens.semantic.positive]
              : [accent + 'b3', accent]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            width: `${Math.max(fillRatio * 100, ratio > 0 ? 2 : 0)}%`,
            height: 8,
          }}
        />
      </View>

      <View className="flex-row items-baseline justify-between" style={{ gap: 8 }}>
        <Text
          className="font-sans-medium text-xs"
          style={{ color: reached ? tokens.semantic.positive : fgColor }}
        >
          {percent}
        </Text>
        {goal.targetDate ? (() => {
          const remaining = formatTimeUntil(goal.targetDate, lang);
          return (
            <View className="flex-row items-baseline" style={{ gap: 6, flexShrink: 1 }}>
              <Text
                className="font-sans text-xs"
                style={{ color: mutedColor }}
                numberOfLines={1}
              >
                {formatDate(new Date(`${goal.targetDate}T00:00:00`), 'long', lang)}
              </Text>
              <Text
                className="font-sans-medium text-xs"
                style={{ color: remaining.past ? tokens.semantic.danger : accent }}
              >
                {'· '}{remaining.label}
              </Text>
            </View>
          );
        })() : null}
      </View>

      {/* Contribute toggle / form */}
      {isContributing ? (
        <View style={{ marginTop: 16 }}>
          <Text className="font-sans text-xs mb-2" style={{ color: mutedColor }}>
            {t('goals:contribute.body')}
          </Text>
          <TextField
            label=""
            value={contribText}
            onChangeText={(text) => setContribText(formatAmountInput(text, lang))}
            placeholder={t('goals:contribute.amountPlaceholder')}
            keyboardType="numeric"
          />
          {/* Account picker — required. Contribution debits this
              account's balance atomically. Without it the user could
              "contribute" money the system can't trace. */}
          <Text
            className="font-sans-medium text-xs uppercase tracking-wider mt-3 mb-2"
            style={{ color: mutedColor }}
          >
            {t('goals:contribute.fromAccount')}
          </Text>
          {accounts.length === 0 ? (
            <Text className="font-sans text-xs" style={{ color: mutedColor }}>
              {t('goals:contribute.noAccounts')}
            </Text>
          ) : (
            <View className="flex-row flex-wrap" style={{ gap: 6 }}>
              {accounts.filter((a) => !a.isArchived).map((acct) => {
                const selected = acct.id === contribAccountId;
                const acctTint = resolveCategoryColor(acct.color, isDark ? 'dark' : 'light');
                return (
                  <Pressable
                    key={acct.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setContribAccountId(acct.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? accent : borderColor,
                      backgroundColor: selected ? accent + '14' : 'transparent',
                      minHeight: 32,
                    }}
                  >
                    <View
                      style={{
                        width: 16, height: 16, borderRadius: 4,
                        backgroundColor: acctTint + '22',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <CategoryIcon name={acct.icon} color={acctTint} size={9} />
                    </View>
                    <Text
                      className="font-sans-medium text-xs"
                      style={{ color: selected ? accent : fgColor }}
                    >
                      {acct.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View className="flex-row gap-2 mt-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('goals:contribute.save')}
              disabled={saving}
              onPress={handleContribute}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: accent,
                minHeight: 44,
                opacity: saving ? 0.5 : 1,
              }}
            >
              <Check size={14} color="#fff" />
              <Text className="font-sans-medium text-white text-sm">
                {saving ? t('goals:contribute.saving') : t('goals:contribute.save')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('goals:contribute.cancel')}
              onPress={onToggleContribute}
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
                borderColor,
                minHeight: 44,
              }}
            >
              <X size={14} color={fgColor} />
              <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                {t('goals:contribute.cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('goals:row.addContribution')}
          onPress={onToggleContribute}
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-start',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 8,
            paddingHorizontal: 12,
            marginTop: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor,
          }}
        >
          <Plus size={12} color={fgColor} />
          <Text className="font-sans-medium text-xs" style={{ color: fgColor }}>
            {t('goals:row.addContribution')}
          </Text>
        </Pressable>
      )}
    </Card>
  );
}

// ---------- GoalEditPanel (add / edit form) ----------

type GoalEditPanelProps = {
  wid: string | null;
  templateKey: string | null;
  onClose: () => void;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  overlayBg: string;
  appAlert: ReturnType<typeof useAppAlert>;
  t: ReturnType<typeof useTranslation>['t'];
  insets: { top: number; bottom: number; left: number; right: number };
};

function GoalEditPanel({
  wid, templateKey, onClose, isDark, lang,
  fgColor, mutedColor, borderColor, overlayBg, appAlert, t, insets,
}: GoalEditPanelProps) {
  const tpl = useMemo(() => getTemplate(templateKey), [templateKey]);
  const [name, setName] = useState(tpl ? tpl.name[lang] : '');
  const [targetText, setTargetText] = useState(
    tpl ? minorToInputText(tpl.suggestedTargetMinor, lang) : '',
  );
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!wid || saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      appAlert(t('goals:form.title'), t('goals:form.errors.missingName'));
      return;
    }
    const target = parseAmountInput(targetText, lang);
    if (target <= 0) {
      appAlert(t('goals:form.title'), t('goals:form.errors.invalidTarget'));
      return;
    }
    setSaving(true);
    try {
      await createGoal(wid, {
        kind: 'sinking_fund',
        name: trimmed,
        targetMinor: target,
        currentMinor: 0,
        targetDate: targetDate.trim() || null,
        templateKey,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('goals:form.errors.saveFailed');
      appAlert(t('goals:title'), msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingTop: 48,
          paddingBottom: 24 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="self-center w-full max-w-md lg:max-w-3xl">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('common:actions.back')}
            onPress={onClose}
            hitSlop={8}
            className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
          >
            <ChevronLeft size={22} color={fgColor} />
            <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
              {t('common:actions.back')}
            </Text>
          </Pressable>

          <Text className="font-sans-bold text-3xl mb-2" style={{ color: fgColor }}>
            {t('goals:form.title')}
          </Text>
          {tpl ? (
            <View
              className="flex-row items-center mb-6"
              style={{ gap: 8 }}
            >
              <View
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  backgroundColor: resolveCategoryColor(tpl.color, isDark ? 'dark' : 'light') + '22',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <CategoryIcon name={tpl.icon} color={resolveCategoryColor(tpl.color, isDark ? 'dark' : 'light')} size={14} />
              </View>
              <Text className="font-sans text-sm" style={{ color: mutedColor }}>
                {t(`goals:templates.${tpl.key}`)}
              </Text>
            </View>
          ) : <View style={{ height: 8 }} />}

          <Card padding="lg" className="mb-4">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('goals:form.nameLabel')}
            </Text>
            <TextField
              label=""
              value={name}
              onChangeText={setName}
              placeholder={t('goals:form.namePlaceholder')}
              autoCapitalize="sentences"
            />
          </Card>

          <Card padding="lg" className="mb-4">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('goals:form.targetLabel')}
            </Text>
            <TextField
              label=""
              value={targetText}
              onChangeText={(text) => setTargetText(formatAmountInput(text, lang))}
              placeholder={t('goals:form.targetPlaceholder')}
              keyboardType="numeric"
            />
          </Card>

          <Card padding="lg" className="mb-6">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('goals:form.targetDateLabel')}
            </Text>
            <DateField
              value={targetDate}
              onChange={setTargetDate}
              placeholder={t('goals:form.targetDatePlaceholder')}
              lang={lang}
              accessibilityLabel={t('goals:form.targetDateLabel')}
              minDate={new Date().toISOString().slice(0, 10)}
            />
          </Card>

          <View className="flex-row gap-2 mt-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('goals:form.cancel')}
              onPress={onClose}
              disabled={saving}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                minHeight: 44,
              }}
            >
              <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                {t('goals:form.cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('goals:form.save')}
              onPress={handleSave}
              disabled={saving}
              style={{
                flex: 2,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: tokens.accent.dashboard,
                minHeight: 44,
                opacity: saving ? 0.5 : 1,
              }}
            >
              <Check size={14} color="#fff" />
              <Text className="font-sans-medium text-white text-sm">
                {saving ? t('goals:form.saving') : t('goals:form.save')}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

