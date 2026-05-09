import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Plus, Settings, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { QuickPreset, CategoryIcon as CategoryIconKey } from '@compass/shared-types';

import { createTransaction } from '@/services/firestore/transactionsService';
import { useAuthUser } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { formatIDR } from '@/shared/utils/formatIDR';
import i18n from 'i18next';

type Props = {
  visible: boolean;
  onClose: () => void;
  presets: QuickPreset[];
  fromPath: '/' | '/transactions' | '/budgets' | '/insights';
};

/**
 * Long-press FAB menu — bottom sheet listing the user's quick-add
 * presets. Tap a preset → atomic transaction write via the standard
 * createTransaction service. Empty state CTA routes to the preset
 * editor for first-time setup.
 *
 * Matches the existing slide-up modal pattern (Insights heatmap day
 * detail, Transactions filter sheet) — backdrop tap closes, drag
 * handle on top, safe-area-aware bottom padding.
 */
export function QuickPresetMenu({ visible, onClose, presets, fromPath }: Props) {
  void fromPath;
  const { t } = useTranslation(['common']);
  const router = useRouter();
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const appAlert = useAppAlert();
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const accent = tokens.accent.dashboard;

  const [submitting, setSubmitting] = useState<string | null>(null);

  const handlePresetTap = async (preset: QuickPreset) => {
    if (!wid || submitting) return;
    setSubmitting(preset.id);
    try {
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      await createTransaction(wid, {
        type: preset.type,
        date,
        accountId: preset.accountId,
        toAccountId: null,
        currency: 'IDR',
        amount: preset.amountMinor,
        splits: preset.type === 'expense' && preset.categoryId
          ? [{ categoryId: preset.categoryId, amount: preset.amountMinor }]
          : [],
        description: preset.description,
        source: 'manual',
        rawInput: null,
        confidence: null,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common:errors.generic');
      appAlert(t('common:errors.title'), msg);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.close')}
        />
        <View
          style={{
            backgroundColor: isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'],
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 8,
            paddingBottom: Math.max(16, insets.bottom),
          }}
        >
          {/* Drag handle */}
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View
              style={{
                width: 40, height: 4, borderRadius: 2,
                backgroundColor: borderColor,
              }}
            />
          </View>
          <View className="px-5 mb-3">
            <Text className="font-sans-bold text-lg" style={{ color: fgColor }}>
              {t('common:quickPresets.title')}
            </Text>
            <Text className="font-sans text-xs mt-0.5" style={{ color: mutedColor }}>
              {t('common:quickPresets.subtitle')}
            </Text>
          </View>
          {presets.length === 0 ? (
            <View className="px-5 pb-3">
              <Text className="font-sans text-sm" style={{ color: mutedColor, marginBottom: 12 }}>
                {t('common:quickPresets.empty')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common:quickPresets.manageCta')}
                onPress={() => {
                  onClose();
                  router.push('/quick-presets' as Href);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: accent,
                  minHeight: 40,
                }}
              >
                <Plus size={14} color="#fff" />
                <Text className="font-sans-medium text-sm" style={{ color: '#fff' }}>
                  {t('common:quickPresets.manageCta')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View>
              {presets.map((p, idx) => {
                const iconName = (p.icon ?? 'zap') as CategoryIconKey;
                const isLast = idx === presets.length - 1;
                const isSubmitting = submitting === p.id;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.label} ${formatIDR(p.amountMinor, lang)}`}
                    onPress={() => { void handlePresetTap(p); }}
                    disabled={isSubmitting}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      borderBottomWidth: isLast ? 0 : 1,
                      borderBottomColor: borderColor,
                      opacity: isSubmitting ? 0.4 : pressed ? 0.65 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: accent + '22',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CategoryIcon name={iconName} color={accent} size={18} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        className="font-sans-medium text-base"
                        style={{ color: fgColor }}
                        numberOfLines={1}
                      >
                        {p.label}
                      </Text>
                      <Text
                        className="font-sans text-xs"
                        style={{ color: mutedColor }}
                        numberOfLines={1}
                      >
                        {p.type === 'income'
                          ? t('common:quickPresets.incomeLabel')
                          : t('common:quickPresets.expenseLabel')}
                      </Text>
                    </View>
                    <Text
                      className="font-mono tabular-nums text-sm"
                      style={{
                        color: p.type === 'income' ? tokens.semantic.positive : fgColor,
                      }}
                    >
                      {p.type === 'income' ? '+' : '−'}
                      {formatIDR(p.amountMinor, lang)}
                    </Text>
                  </Pressable>
                );
              })}
              {/* Manage link at the bottom */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common:quickPresets.manageCta')}
                onPress={() => {
                  onClose();
                  router.push('/quick-presets' as Href);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <Settings size={14} color={mutedColor} />
                <Text className="font-sans-medium text-sm" style={{ color: mutedColor }}>
                  {t('common:quickPresets.manageCta')}
                </Text>
              </Pressable>
            </View>
          )}
          {/* Hint about long-press */}
          <View className="px-5 pt-2">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Zap size={11} color={mutedColor} />
              <Text className="font-sans text-[11px]" style={{ color: mutedColor, flex: 1 }}>
                {t('common:quickPresets.hint')}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
