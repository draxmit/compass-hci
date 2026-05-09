import { PartyPopper, Trophy } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import { formatIDR } from '@/shared/utils/formatIDR';

import type { PendingMilestone } from './useGoalMilestone';

type Props = {
  pending: PendingMilestone | null;
  onDismiss: () => void;
  lang: Locale;
};

/**
 * Goal milestone celebration overlay (#5). Fires once per (goal,
 * threshold) pair when the user first crosses a 25/50/75/100%
 * threshold. The modal renders centered with a tinted backdrop and
 * a "Keep going" / "Done" button that records the threshold as seen.
 *
 * Trophy icon for 100%, party-popper for 25/50/75 — the visual swap
 * differentiates "you finished" from "you're on track" without needing
 * separate copy variants.
 */
export function GoalMilestoneModal({ pending, onDismiss, lang }: Props) {
  const { t } = useTranslation(['goals', 'common']);
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const accent = tokens.semantic.positive;

  if (!pending) return null;
  const isComplete = pending.threshold === 100;
  const Icon = isComplete ? Trophy : PartyPopper;
  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
        accessibilityRole="button"
        accessibilityLabel={t('common:actions.close')}
        onPress={onDismiss}
      >
        <Pressable
          // Inner Pressable absorbs taps so backdrop-tap dismisses but
          // tapping the card itself doesn't.
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
          style={{
            width: '100%',
            maxWidth: 360,
            borderRadius: 20,
            backgroundColor: isDark ? tokens.surface['dark-card'] : tokens.surface['light-bg'],
            borderWidth: 1,
            borderColor: accent + '55',
            padding: 24,
            alignItems: 'center',
            shadowColor: accent,
            shadowOpacity: 0.3,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }}
        >
          {/* Hero icon */}
          <View
            style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: accent + '22',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Icon size={36} color={accent} strokeWidth={2.4} />
          </View>
          {/* Headline */}
          <Text
            className="font-sans-bold text-2xl text-center"
            style={{ color: fgColor }}
          >
            {isComplete
              ? t('goals:milestone.titleComplete')
              : t('goals:milestone.title', { pct: pending.threshold })}
          </Text>
          {/* Goal name */}
          <Text
            className="font-sans-medium text-base text-center mt-1"
            style={{ color: accent }}
            numberOfLines={1}
          >
            {pending.goal.name}
          </Text>
          {/* Body copy */}
          <Text
            className="font-sans text-sm text-center mt-3"
            style={{ color: mutedColor, lineHeight: 20 }}
          >
            {isComplete
              ? t('goals:milestone.bodyComplete', {
                  amount: formatIDR(pending.goal.currentMinor, lang),
                })
              : t('goals:milestone.body', {
                  current: formatIDR(pending.goal.currentMinor, lang),
                  target: formatIDR(pending.goal.targetMinor, lang),
                  remaining: formatIDR(
                    Math.max(0, pending.goal.targetMinor - pending.goal.currentMinor),
                    lang,
                  ),
                })}
          </Text>
          {/* Progress bar */}
          <View
            style={{
              width: '100%',
              height: 8,
              borderRadius: 4,
              marginTop: 18,
              backgroundColor: accent + '22',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.min(100, pending.progress * 100)}%`,
                height: '100%',
                backgroundColor: accent,
              }}
            />
          </View>
          <Text
            className="font-mono tabular-nums text-xs mt-2"
            style={{ color: accent }}
          >
            {Math.round(Math.min(100, pending.progress * 100))}%
          </Text>
          {/* CTA */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isComplete
                ? t('goals:milestone.ctaComplete')
                : t('goals:milestone.cta')
            }
            onPress={onDismiss}
            style={({ pressed }) => ({
              marginTop: 20,
              alignSelf: 'stretch',
              alignItems: 'center',
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: accent,
              opacity: pressed ? 0.85 : 1,
              minHeight: 44,
            })}
          >
            <Text className="font-sans-medium text-sm" style={{ color: '#fff' }}>
              {isComplete
                ? t('goals:milestone.ctaComplete')
                : t('goals:milestone.cta')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
