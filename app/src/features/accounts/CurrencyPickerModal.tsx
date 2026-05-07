import type { Currency } from '@compass/shared-types';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import { CURRENCIES, CURRENCY_META } from '@/shared/utils/currencyMeta';

export type CurrencyPickerModalProps = {
  visible: boolean;
  selected: Currency;
  onSelect: (next: Currency) => void;
  onClose: () => void;
  lang: Locale;
};

/**
 * Full-screen sheet picker for the account currency (B redesign).
 * Replaces the prior 10-chip wrap row that read as cluttered.
 *
 * Layout per row: bold currency code on the left (e.g. "Rp", "$"),
 * full bilingual name on the right (e.g. "Indonesian Rupiah"),
 * a check on the active row. Tapping a row commits the choice and
 * closes the sheet.
 *
 * The sheet uses RN's `Modal` with `presentationStyle: 'pageSheet'`
 * which renders as a sliding bottom sheet on iOS, full-screen on
 * Android, and a centered card on web. Same primitive as
 * SplitsEditorModal — keeps the modal vocabulary consistent.
 */
export function CurrencyPickerModal({
  visible, selected, onSelect, onClose, lang,
}: CurrencyPickerModalProps) {
  const { t } = useTranslation(['accounts', 'common']);
  const { resolvedScheme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = resolvedScheme === 'dark';
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="slide"
      presentationStyle="pageSheet"
      transparent={false}
    >
      <View style={{ flex: 1, backgroundColor: overlayBg, paddingTop: insets.top }}>
        <View
          className="flex-row items-center justify-between px-6"
          style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: borderColor }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.cancel')}
            onPress={onClose}
            hitSlop={8}
            style={{ minHeight: 36, justifyContent: 'center' }}
          >
            <Text className="font-sans-medium text-sm" style={{ color: mutedColor }}>
              {t('common:actions.cancel')}
            </Text>
          </Pressable>
          <Text className="font-sans-semibold text-base" style={{ color: fgColor }}>
            {t('accounts:fields.currency')}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 24 + insets.bottom,
          }}
        >
          <View className="self-center w-full max-w-md lg:max-w-2xl">
            {CURRENCIES.map((code) => {
              const meta = CURRENCY_META[code];
              const active = code === selected;
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelect(code)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    backgroundColor: active ? tokens.accent.dashboard + '14' : 'transparent',
                    minHeight: 56,
                    marginBottom: 4,
                  }}
                >
                  {/* Currency code badge — fixed-width so labels align */}
                  <View
                    style={{
                      width: 48,
                      paddingVertical: 4,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: active ? tokens.accent.dashboard : borderColor,
                      backgroundColor: active ? tokens.accent.dashboard + '22' : 'transparent',
                      alignItems: 'center',
                      marginRight: 14,
                    }}
                  >
                    <Text
                      className="font-sans-bold text-xs"
                      style={{ color: active ? tokens.accent.dashboard : fgColor }}
                    >
                      {meta.symbol}
                    </Text>
                    <Text
                      className="font-sans text-xs"
                      style={{ color: mutedColor, marginTop: 1 }}
                    >
                      {code}
                    </Text>
                  </View>
                  <Text
                    className="font-sans-medium text-sm flex-1"
                    style={{ color: active ? tokens.accent.dashboard : fgColor }}
                  >
                    {meta.label[lang]}
                  </Text>
                  {active ? (
                    <Check size={18} color={tokens.accent.dashboard} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
