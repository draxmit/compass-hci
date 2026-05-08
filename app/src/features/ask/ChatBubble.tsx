import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';

import type { ChatMessage } from './types';

/**
 * Single chat-bubble row. User messages right-align with an emerald
 * gradient bubble; assistant messages left-align with a card-style
 * surface. The width caps at 85% so long messages wrap without
 * spilling the bubble across the entire screen.
 *
 * The user bubble uses a vertical gradient (~98% saturation top to
 * 100% bottom) to add subtle depth — common pattern in iMessage /
 * WhatsApp / Slack DMs where the user's outbound message is the
 * visual anchor.
 */
export function ChatBubble({ message }: { message: ChatMessage }) {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const isUser = message.role === 'user';

  const fg = isUser
    ? '#fff'
    : isDark
      ? tokens.surface['dark-fg']
      : tokens.surface['light-fg'];
  const borderColor = isDark
    ? tokens.surface['dark-border']
    : tokens.surface['light-border'];

  const bubbleStyle = {
    borderRadius: 14,
    borderTopRightRadius: isUser ? 4 : 14,
    borderTopLeftRadius: isUser ? 14 : 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  } as const;

  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        marginBottom: 8,
      }}
    >
      {isUser ? (
        <LinearGradient
          colors={[tokens.accent.dashboard, tokens.accent.dashboard + 'e0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={bubbleStyle}
        >
          <Text className="font-sans text-sm" style={{ color: fg, lineHeight: 20 }}>
            {message.content}
          </Text>
        </LinearGradient>
      ) : (
        <View
          style={{
            ...bubbleStyle,
            backgroundColor: isDark
              ? tokens.surface['dark-card']
              : tokens.surface['light-card'],
            borderWidth: 1,
            borderColor,
          }}
        >
          <Text className="font-sans text-sm" style={{ color: fg, lineHeight: 20 }}>
            {message.content}
          </Text>
        </View>
      )}
    </View>
  );
}
