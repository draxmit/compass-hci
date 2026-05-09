import type { Account, Category, QuickPreset } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import type { TFunction } from 'i18next';
import { ChevronLeft, Plus, Trash2, Zap } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { updateUserDoc } from '@/services/firebase';
import { subscribeAccounts } from '@/services/firestore/accountsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import { useAuthUser, useUserDoc } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import {
  formatAmountInput, minorToInputText, parseAmountInput,
} from '@/shared/utils/amountInput';
import { formatIDR } from '@/shared/utils/formatIDR';

const MAX_PRESETS = 6;

type EditTarget = { mode: 'create' } | { mode: 'edit'; preset: QuickPreset };

/**
 * Quick-add preset editor. Reachable from the FAB long-press menu's
 * "Manage" link, or from the preset menu's empty-state CTA. Lets the
 * user define up to 6 one-tap-create transaction shortcuts.
 */
export default function QuickPresetsScreen() {
  const { t, i18n } = useTranslation(['common', 'transactions', 'accounts']);
  const router = useRouter();
  const user = useAuthUser();
  const userDoc = useUserDoc();
  const { resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const appAlert = useAppAlert();

  const wid = user ? `solo-${user.uid}` : null;
  const presets = useMemo(() => userDoc?.quickPresets ?? [], [userDoc?.quickPresets]);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const accent = tokens.accent.dashboard;

  useEffect(() => {
    if (!wid) return;
    const unsubA = subscribeAccounts(wid, setAccounts);
    const unsubC = subscribeCategories(wid, setCategories);
    return () => { unsubA(); unsubC(); };
  }, [wid]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editTarget) { setEditTarget(null); return true; }
      if (router.canGoBack()) return false;
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [router, editTarget]);

  const handleSave = async (preset: QuickPreset) => {
    if (!user) return;
    const next: QuickPreset[] = (() => {
      const existing = presets.findIndex((p) => p.id === preset.id);
      if (existing >= 0) {
        const copy = [...presets];
        copy[existing] = preset;
        return copy;
      }
      return [...presets, preset];
    })();
    try {
      await updateUserDoc(user.uid, { quickPresets: next });
      setEditTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save preset';
      appAlert(t('common:errors.title'), msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    appAlert(
      t('common:quickPresets.deleteConfirmTitle'),
      t('common:quickPresets.deleteConfirmBody'),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('common:actions.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await updateUserDoc(user.uid, {
                  quickPresets: presets.filter((p) => p.id !== id),
                });
                setEditTarget(null);
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to delete';
                appAlert(t('common:errors.title'), msg);
              }
            })();
          },
        },
      ],
    );
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (editTarget) {
    return (
      <PresetEditor
        target={editTarget}
        accounts={accounts.filter((a) => !a.isArchived)}
        categories={categories.filter((c) => !c.isArchived)}
        lang={lang}
        isDark={isDark}
        fgColor={fgColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
        accent={accent}
        insetsTop={insets.top}
        onCancel={() => setEditTarget(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        t={t}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, paddingTop: 16 + insets.top, paddingBottom: 100 }}
    >
      <View className="self-center w-full max-w-md lg:max-w-3xl">
        <View className="flex-row items-center mb-3" style={{ gap: 8, minHeight: 36 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.back')}
            onPress={goBack}
            hitSlop={8}
            style={{
              width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color={mutedColor} />
          </Pressable>
          <Text className="font-sans-bold text-2xl flex-1" style={{ color: fgColor }}>
            {t('common:quickPresets.title')}
          </Text>
        </View>
        <Text className="font-sans text-sm mb-6" style={{ color: mutedColor }}>
          {t('common:quickPresets.editorIntro', { max: MAX_PRESETS })}
        </Text>

        {presets.length === 0 ? (
          <Card padding="lg" className="items-center">
            <View
              style={{
                width: 56, height: 56, borderRadius: 14,
                backgroundColor: accent + '22',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Zap size={28} color={accent} strokeWidth={2.2} />
            </View>
            <Text className="font-sans-bold text-lg text-center" style={{ color: fgColor }}>
              {t('common:quickPresets.editorEmptyTitle')}
            </Text>
            <Text
              className="font-sans text-sm text-center mt-2 mb-5"
              style={{ color: mutedColor, lineHeight: 20 }}
            >
              {t('common:quickPresets.editorEmptyBody')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common:quickPresets.addCta')}
              onPress={() => setEditTarget({ mode: 'create' })}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, paddingVertical: 10,
                borderRadius: 10, backgroundColor: accent, minHeight: 44,
              }}
            >
              <Plus size={14} color="#fff" />
              <Text className="font-sans-medium text-sm" style={{ color: '#fff' }}>
                {t('common:quickPresets.addCta')}
              </Text>
            </Pressable>
          </Card>
        ) : (
          <View>
            {presets.map((p) => {
              const cat = p.categoryId ? categories.find((c) => c.id === p.categoryId) : null;
              const tint = cat
                ? resolveCategoryColor(cat.color, isDark ? 'dark' : 'light')
                : accent;
              const acc = accounts.find((a) => a.id === p.accountId);
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${p.label}`}
                  onPress={() => setEditTarget({ mode: 'edit', preset: p })}
                  style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1, marginBottom: 10 })}
                >
                  <Card padding="md">
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View
                        style={{
                          width: 40, height: 40, borderRadius: 10,
                          backgroundColor: tint + '22',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Zap size={18} color={tint} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text className="font-sans-medium text-base" style={{ color: fgColor }}>
                          {p.label}
                        </Text>
                        <Text className="font-sans text-xs" style={{ color: mutedColor }}>
                          {formatIDR(p.amountMinor, lang)}
                          {acc ? ` · ${acc.name}` : ''}
                          {cat ? ` · ${cat.name[lang]}` : ''}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
            {presets.length < MAX_PRESETS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common:quickPresets.addCta')}
                onPress={() => setEditTarget({ mode: 'create' })}
                style={{
                  flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 10, marginTop: 8,
                  borderRadius: 10, borderWidth: 1, borderColor,
                  minHeight: 40,
                }}
              >
                <Plus size={14} color={fgColor} />
                <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                  {t('common:quickPresets.addCta')}
                </Text>
              </Pressable>
            ) : (
              <Text className="font-sans text-xs mt-2" style={{ color: mutedColor }}>
                {t('common:quickPresets.maxReached', { max: MAX_PRESETS })}
              </Text>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ---------- PresetEditor ----------

type PresetEditorProps = {
  target: EditTarget;
  accounts: Account[];
  categories: Category[];
  lang: Locale;
  isDark: boolean;
  fgColor: string;
  mutedColor: string;
  borderColor: string;
  accent: string;
  insetsTop: number;
  onCancel: () => void;
  onSave: (p: QuickPreset) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  t: TFunction;
};

function PresetEditor({
  target, accounts, categories, lang, isDark, fgColor, mutedColor, borderColor, accent,
  insetsTop, onCancel, onSave, onDelete, t,
}: PresetEditorProps) {
  void isDark;
  const isEdit = target.mode === 'edit';
  const initial: QuickPreset | null = isEdit ? target.preset : null;
  const [label, setLabel] = useState(initial?.label ?? '');
  const [type, setType] = useState<'expense' | 'income'>(initial?.type ?? 'expense');
  const [amountText, setAmountText] = useState(
    initial ? minorToInputText(initial.amountMinor, lang) : '',
  );
  const [accountId, setAccountId] = useState<string | null>(initial?.accountId ?? accounts[0]?.id ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    if (!label.trim()) return;
    const amount = parseAmountInput(amountText, lang);
    if (!amount) return;
    if (!accountId) return;
    if (type === 'expense' && !categoryId) return;
    setSaving(true);
    const preset: QuickPreset = {
      id: initial?.id ?? `qp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: label.trim(),
      type,
      amountMinor: amount,
      accountId,
      categoryId: type === 'expense' ? categoryId : null,
      description: description.trim(),
      icon: 'zap',
    };
    try {
      await onSave(preset);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 24, paddingTop: 16 + insetsTop, paddingBottom: 100 }}
    >
      <View className="self-center w-full max-w-md lg:max-w-3xl">
        <View className="flex-row items-center mb-4" style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.cancel')}
            onPress={onCancel}
            hitSlop={8}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={20} color={mutedColor} />
          </Pressable>
          <Text className="font-sans-bold text-2xl flex-1" style={{ color: fgColor }}>
            {isEdit ? t('common:quickPresets.editTitle') : t('common:quickPresets.addCta')}
          </Text>
          {isEdit && initial ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.delete')}
              onPress={() => { void onDelete(initial.id); }}
              hitSlop={8}
              style={{ padding: 8 }}
            >
              <Trash2 size={18} color={tokens.semantic.danger} />
            </Pressable>
          ) : null}
        </View>

        <Card padding="md" className="mb-4">
          <TextField
            label={t('common:quickPresets.fields.label')}
            value={label}
            onChangeText={setLabel}
            placeholder={t('common:quickPresets.fields.labelPlaceholder')}
          />
          <View style={{ height: 12 }} />
          {/* Type segmented */}
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
            {t('common:quickPresets.fields.type')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['expense', 'income'] as const).map((tp) => {
              const selected = type === tp;
              return (
                <Pressable
                  key={tp}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setType(tp)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: selected ? accent : borderColor,
                    backgroundColor: selected ? accent + '14' : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    className="font-sans-medium text-sm"
                    style={{ color: selected ? accent : fgColor }}
                  >
                    {t(`transactions:entry.types.${tp}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextField
            label={t('common:quickPresets.fields.amount')}
            value={amountText}
            onChangeText={(text) => setAmountText(formatAmountInput(text, lang))}
            placeholder="0"
            keyboardType="numeric"
          />
        </Card>

        <Card padding="md" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
            {t('common:quickPresets.fields.account')}
          </Text>
          {accounts.length === 0 ? (
            <Text className="font-sans text-sm" style={{ color: mutedColor }}>
              {t('transactions:entry.pickers.noAccounts')}
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {accounts.map((a) => {
                const selected = accountId === a.id;
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setAccountId(a.id)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: selected ? accent : borderColor,
                      backgroundColor: selected ? accent + '14' : 'transparent',
                    }}
                  >
                    <Text
                      className="font-sans-medium text-xs"
                      style={{ color: selected ? accent : fgColor }}
                    >
                      {a.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        {type === 'expense' ? (
          <Card padding="md" className="mb-4">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2" style={{ color: mutedColor }}>
              {t('common:quickPresets.fields.category')}
            </Text>
            {categories.length === 0 ? (
              <Text className="font-sans text-sm" style={{ color: mutedColor }}>
                {t('transactions:entry.pickers.noCategories')}
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {categories.map((c) => {
                  const selected = categoryId === c.id;
                  const tint = resolveCategoryColor(c.color, isDark ? 'dark' : 'light');
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setCategoryId(c.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 10, paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: selected ? tint : borderColor,
                        backgroundColor: selected ? tint + '14' : 'transparent',
                      }}
                    >
                      <CategoryIcon name={c.icon} color={tint} size={12} />
                      <Text
                        className="font-sans-medium text-xs"
                        style={{ color: selected ? tint : fgColor }}
                      >
                        {c.name[lang]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Card>
        ) : null}

        <Card padding="md" className="mb-6">
          <TextField
            label={t('common:quickPresets.fields.description')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('common:quickPresets.fields.descriptionPlaceholder')}
          />
        </Card>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.cancel')}
            onPress={onCancel}
            style={{
              flex: 1,
              alignItems: 'center', justifyContent: 'center',
              paddingVertical: 12,
              borderRadius: 10, borderWidth: 1, borderColor,
              minHeight: 44,
            }}
          >
            <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
              {t('common:actions.cancel')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.save')}
            onPress={() => { void handleSave(); }}
            disabled={saving}
            style={{
              flex: 1,
              alignItems: 'center', justifyContent: 'center',
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: accent,
              minHeight: 44,
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text className="font-sans-medium text-sm" style={{ color: '#fff' }}>
              {saving ? t('common:actions.saving') : t('common:actions.save')}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
