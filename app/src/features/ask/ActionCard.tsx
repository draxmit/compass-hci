import { Eye, Map, Wallet } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';

import type { SuggestedAction } from './types';

/**
 * Tappable pill rendered below an assistant chat bubble. Each maps to
 * a `SuggestedAction` returned by Gemini; tap deep-links to the
 * appropriate screen with pre-filled fields. The `actionHandler`
 * module owns the routing logic — this component is purely visual.
 */
export function ActionCard({
  action,
  onPress,
}: {
  action: SuggestedAction;
  onPress: () => void;
}) {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const fg = tokens.accent.dashboard;
  const borderColor = isDark
    ? tokens.surface['dark-border']
    : tokens.surface['light-border'];

  const Icon = iconFor(action.type);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={onPress}
      style={({ hovered, pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor:
          (hovered as boolean | undefined) || pressed
            ? tokens.accent.dashboard + '88'
            : borderColor,
        backgroundColor:
          (hovered as boolean | undefined) || pressed
            ? tokens.accent.dashboard + '1f'
            : tokens.accent.dashboard + '10',
        alignSelf: 'flex-start',
        marginTop: 4,
        minHeight: 36,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          backgroundColor: tokens.accent.dashboard + '22',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={12} color={fg} />
      </View>
      <Text
        className="font-sans-medium text-xs"
        style={{ color: fg }}
        numberOfLines={2}
      >
        {action.label}
      </Text>
    </Pressable>
  );
}

function iconFor(type: SuggestedAction['type']) {
  switch (type) {
    case 'createBudget':
      return Wallet;
    case 'viewTransactions':
      return Eye;
    case 'navigate':
    default:
      return Map;
  }
}
