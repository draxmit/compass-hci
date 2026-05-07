import type { Category, CategoryColor, CategoryIcon as CategoryIconKey } from '@compass/shared-types';
import { useRouter } from 'expo-router';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  archiveCategory, createCategory, subscribeCategories, updateCategory,
} from '@/services/firestore/categoriesService';
import { useAuthUser } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { CATEGORY_COLOR_KEYS, resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { CATEGORY_ICON_KEYS, CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';

type EditTarget =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'edit'; category: Category };

/**
 * /categories — list + add/edit/archive. Reached from Settings (T11 will
 * also surface it from a more prominent location). Realtime subscription
 * keeps the list fresh; soft-delete only (archive flips a flag).
 *
 * Single-file approach: the edit panel renders inline as a state-toggled
 * full-pane replacement instead of a separate Stack route. Keeps state
 * local + simple; Stack-modal-on-Stack-modal had compositing issues
 * during T2 (see T2-summary).
 */
export default function CategoriesScreen() {
  const { t, i18n } = useTranslation(['categories', 'common']);
  const { resolvedScheme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;

  const [categories, setCategories] = useState<Category[]>([]);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  useEffect(() => {
    if (!wid) return;
    return subscribeCategories(wid, setCategories);
  }, [wid]);

  // Hardware-back handling: when the edit panel is open, close it instead of
  // popping the route. Otherwise fall back to default routing (router.back()
  // on push, or replace('/') on the replace path).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editTarget) {
        setEditTarget(null);
        return true;
      }
      if (router.canGoBack()) return false;
      router.replace('/');
      return true;
    });
    return () => sub.remove();
  }, [router, editTarget]);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];

  const groups = useMemo(() => {
    const parents = categories.filter((c) => c.parentId === null).sort((a, b) => a.order - b.order);
    return parents.map((parent) => ({
      parent,
      children: categories
        .filter((c) => c.parentId === parent.id)
        .sort((a, b) => a.order - b.order),
    }));
  }, [categories]);

  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      {editTarget ? (
        <CategoryEditPanel
          target={editTarget}
          parents={categories.filter((c) => c.parentId === null)}
          onClose={() => setEditTarget(null)}
          wid={wid!}
          lang={lang}
          isDark={isDark}
        />
      ) : (
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

            <View className="flex-row items-end justify-between mb-1">
              <Text className="font-sans-bold text-3xl">{t('categories:title')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('categories:add')}
                onPress={() => setEditTarget({ mode: 'create', parentId: null })}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: tokens.accent.dashboard,
                  minHeight: 36,
                }}
              >
                <Plus size={16} color="#fff" />
                <Text className="font-sans-medium text-white text-sm">
                  {t('categories:addNew')}
                </Text>
              </Pressable>
            </View>
            <Text className="font-sans text-surface-light-fg-muted dark:text-surface-dark-fg-muted mb-6">
              {t('categories:tagline')}
            </Text>

            {groups.length === 0 ? (
              <Card padding="lg">
                <Text className="font-sans text-sm" style={{ color: mutedColor }}>
                  {t('categories:empty')}
                </Text>
              </Card>
            ) : (
              groups.map(({ parent, children }) => (
                <CategoryGroup
                  key={parent.id}
                  parent={parent}
                  children_={children}
                  isDark={isDark}
                  lang={lang}
                  onEditParent={() => setEditTarget({ mode: 'edit', category: parent })}
                  onEditChild={(c) => setEditTarget({ mode: 'edit', category: c })}
                  onAddChild={() => setEditTarget({ mode: 'create', parentId: parent.id })}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

type CategoryGroupProps = {
  parent: Category;
  children_: Category[];
  isDark: boolean;
  lang: Locale;
  onEditParent: () => void;
  onEditChild: (c: Category) => void;
  onAddChild: () => void;
};

function CategoryGroup({ parent, children_, isDark, lang, onEditParent, onEditChild, onAddChild }: CategoryGroupProps) {
  const { t } = useTranslation(['categories']);
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const parentTint = resolveCategoryColor(parent.color, isDark ? 'dark' : 'light');

  return (
    <Card padding="none" className="mb-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={parent.name[lang]}
        onPress={onEditParent}
        className="flex-row items-center px-4 py-3 min-h-[44px]"
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: parentTint + '22',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <CategoryIcon name={parent.icon} color={parentTint} size={18} />
        </View>
        <Text className="font-sans-semibold flex-1" style={{ color: fgColor }}>
          {parent.name[lang]}
        </Text>
        {parent.isPreset ? (
          <Text className="font-sans text-xs" style={{ color: mutedColor }}>
            {t('categories:preset')}
          </Text>
        ) : null}
      </Pressable>

      {children_.length === 0 ? (
        <View className="px-4 pb-3">
          <Text className="font-sans text-xs" style={{ color: mutedColor }}>
            {t('categories:section.noChildren')}
          </Text>
        </View>
      ) : (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'],
          }}
        >
          {children_.map((child, idx) => {
            const childTint = resolveCategoryColor(child.color, isDark ? 'dark' : 'light');
            return (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={child.name[lang]}
                onPress={() => onEditChild(child)}
                className="flex-row items-center px-4 py-3 min-h-[44px]"
                style={{
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'],
                }}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    backgroundColor: childTint + '22',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                    marginLeft: 24,
                  }}
                >
                  <CategoryIcon name={child.icon} color={childTint} size={16} />
                </View>
                <Text className="font-sans flex-1" style={{ color: fgColor }}>
                  {child.name[lang]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('categories:add')}
        onPress={onAddChild}
        className="flex-row items-center px-4 py-3 min-h-[44px]"
        style={{
          borderTopWidth: 1,
          borderTopColor: isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'],
        }}
      >
        <View style={{ width: 32, alignItems: 'center', marginRight: 12 }}>
          <Plus size={16} color={mutedColor} />
        </View>
        <Text className="font-sans-medium text-sm" style={{ color: mutedColor }}>
          {t('categories:add')}
        </Text>
      </Pressable>
    </Card>
  );
}

type CategoryEditPanelProps = {
  target: EditTarget;
  parents: Category[];
  onClose: () => void;
  wid: string;
  lang: Locale;
  isDark: boolean;
};

function CategoryEditPanel({ target, parents, onClose, wid, lang, isDark }: CategoryEditPanelProps) {
  const { t } = useTranslation(['categories', 'common']);
  const appAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const editing = target.mode === 'edit' ? target.category : null;
  const startName = editing?.name[lang] ?? '';
  const startIcon: CategoryIconKey = editing?.icon ?? 'tag';
  const startColor: CategoryColor = editing?.color ?? 'slate';
  const startParentId = target.mode === 'edit' ? editing!.parentId : target.parentId;

  const [name, setName] = useState(startName);
  const [icon, setIcon] = useState<CategoryIconKey>(startIcon);
  const [color, setColor] = useState<CategoryColor>(startColor);
  const [parentId, setParentId] = useState<string | null>(startParentId);
  const [saving, setSaving] = useState(false);

  const isEdit = target.mode === 'edit';
  const isPresetEdit = isEdit && editing!.isPreset;

  const handleSave = async () => {
    if (saving) return;
    if (!isPresetEdit && !name.trim()) {
      appAlert(t('categories:title'), t('categories:errors.missingName'));
      return;
    }
    setSaving(true);
    try {
      if (target.mode === 'create') {
        await createCategory(wid, {
          parentId,
          name: { id: name.trim(), en: name.trim() },
          icon,
          color,
        });
      } else {
        const patch: { icon: CategoryIconKey; color: CategoryColor; parentId: string | null; name?: { id: string; en: string } } = {
          icon,
          color,
          parentId,
        };
        if (!isPresetEdit && name.trim() !== startName) {
          patch.name = { id: name.trim(), en: name.trim() };
        }
        await updateCategory(wid, editing!.id, patch);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : isEdit
          ? t('categories:errors.updateFailed')
          : t('categories:errors.createFailed');
      appAlert(t('categories:title'), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!editing) return;
    appAlert(
      t('categories:actions.archiveConfirmTitle'),
      t('categories:actions.archiveConfirmBody'),
      [
        { text: t('categories:actions.cancel'), style: 'cancel' },
        {
          text: t('categories:actions.archive'),
          style: 'destructive',
          onPress: async () => {
            try {
              await archiveCategory(wid, editing.id);
              onClose();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : t('categories:errors.archiveFailed');
              appAlert(t('categories:title'), msg);
            }
          },
        },
      ],
    );
  };

  const accent = resolveCategoryColor(color, isDark ? 'dark' : 'light');

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        paddingTop: 48,
        paddingBottom: 24 + insets.bottom,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="self-center w-full max-w-md">
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

        <Text className="font-sans-bold text-3xl mb-1">
          {isEdit ? t('categories:edit') : t('categories:addCustom')}
        </Text>
        {isPresetEdit ? (
          <Text className="font-sans text-sm mb-6" style={{ color: mutedColor }}>
            {t('categories:presetLockedHint')}
          </Text>
        ) : null}

        {/* Preview tile */}
        <View className="items-center my-4">
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: accent + '22',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CategoryIcon name={icon} color={accent} size={28} strokeWidth={2.2} />
          </View>
        </View>

        {/* Name field — read-only for presets */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('categories:fields.name')}
          </Text>
          {isPresetEdit ? (
            <Text className="font-sans-semibold text-base">{editing!.name[lang]}</Text>
          ) : (
            <TextField
              label=""
              value={name}
              onChangeText={setName}
              placeholder={t('categories:fields.namePlaceholder')}
              autoCapitalize="words"
              returnKeyType="done"
            />
          )}
        </Card>

        {/* Parent picker */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('categories:fields.parent')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: parentId === null }}
            onPress={() => setParentId(null)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: parentId === null ? tokens.accent.dashboard : borderColor,
              backgroundColor: parentId === null ? tokens.accent.dashboard + '14' : 'transparent',
              marginBottom: 8,
            }}
          >
            <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }}>
              {t('categories:fields.noParent')}
            </Text>
          </Pressable>
          {parents
            .filter((p) => !editing || p.id !== editing.id)
            .map((p) => {
              const tint = resolveCategoryColor(p.color, isDark ? 'dark' : 'light');
              const selected = parentId === p.id;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setParentId(p.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: selected ? tokens.accent.dashboard : borderColor,
                    backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      backgroundColor: tint + '22',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}
                  >
                    <CategoryIcon name={p.icon} color={tint} size={14} />
                  </View>
                  <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }}>
                    {p.name[lang]}
                  </Text>
                </Pressable>
              );
            })}
        </Card>

        {/* Icon picker */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('categories:fields.icon')}
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {CATEGORY_ICON_KEYS.map((key) => {
              const selected = key === icon;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setIcon(key)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: selected ? accent : borderColor,
                    backgroundColor: selected ? accent + '22' : 'transparent',
                  }}
                >
                  <CategoryIcon name={key} color={selected ? accent : mutedColor} size={18} />
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Color picker */}
        <Card padding="lg" className="mb-4">
          <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
            {t('categories:fields.color')}
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 10 }}>
            {CATEGORY_COLOR_KEYS.map((key) => {
              const selected = key === color;
              const swatch = resolveCategoryColor(key, isDark ? 'dark' : 'light');
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={key}
                  accessibilityState={{ selected }}
                  onPress={() => setColor(key)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: swatch,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: selected ? 3 : 0,
                    borderColor: isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'],
                  }}
                />
              );
            })}
          </View>
        </Card>

        <View className="flex-row gap-2 mt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('categories:actions.cancel')}
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
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
              {t('categories:actions.cancel')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('categories:actions.save')}
            disabled={saving}
            onPress={handleSave}
            style={{
              flex: 2,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: tokens.accent.dashboard,
              opacity: saving ? 0.5 : 1,
              minHeight: 44,
            }}
          >
            <Text className="font-sans-medium text-white text-sm">
              {saving ? t('categories:actions.saving') : t('categories:actions.save')}
            </Text>
          </Pressable>
        </View>

        {/* Archive button — only for existing custom categories. Presets archiving
            is allowed too, with the same flow. */}
        {isEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('categories:actions.archive')}
            onPress={handleArchive}
            className="items-center justify-center mt-4 py-3 min-h-[44px]"
          >
            <Text className="font-sans-medium text-sm" style={{ color: tokens.semantic.danger }}>
              {t('categories:actions.archive')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}
