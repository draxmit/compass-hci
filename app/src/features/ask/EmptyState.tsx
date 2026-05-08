import { Sparkles } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';

/**
 * First-launch view for /ask — shows a brief explanation + four
 * starter prompts the user can tap to seed the input. Same shape as
 * the welcome cards on /transactions and /goals.
 *
 * The starter prompts are i18n'd; tapping fills the input rather than
 * sending immediately so the user can edit before committing.
 */
export function EmptyState({
  onPickPrompt,
}: {
  onPickPrompt: (prompt: string) => void;
}) {
  const { t } = useTranslation('ask');
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const fg = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const muted = isDark
    ? tokens.surface['dark-fg-muted']
    : tokens.surface['light-fg-muted'];
  const border = isDark
    ? tokens.surface['dark-border']
    : tokens.surface['light-border'];

  // Four starter prompts. Keys live in ask.json.
  const promptKeys = [
    'starters.spendingThisMonth',
    'starters.topCategory',
    'starters.budgetSuggestion',
    'starters.savingsTowardGoal',
  ] as const;

  return (
    <View
      style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16 }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          backgroundColor: tokens.accent.dashboard + '22',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Sparkles size={28} color={tokens.accent.dashboard} />
      </View>
      <Text
        className="font-sans-bold text-2xl text-center"
        style={{ color: fg }}
      >
        {t('emptyState.title')}
      </Text>
      <Text
        className="font-sans text-sm text-center mt-2"
        style={{ color: muted, maxWidth: 320 }}
      >
        {t('emptyState.body')}
      </Text>
      <View style={{ marginTop: 24, alignSelf: 'stretch', gap: 8 }}>
        {promptKeys.map((k) => {
          const prompt = t(k);
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              onPress={() => onPickPrompt(prompt)}
              style={({ hovered, pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor:
                  (hovered as boolean | undefined) || pressed
                    ? tokens.accent.dashboard + '66'
                    : border,
                backgroundColor:
                  (hovered as boolean | undefined) || pressed
                    ? tokens.accent.dashboard + '0d'
                    : 'transparent',
                minHeight: 44,
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.99 : 1 }],
              })}
            >
              <Text
                className="font-sans text-sm"
                style={{ color: fg }}
                numberOfLines={2}
              >
                {prompt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
