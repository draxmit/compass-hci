import { View } from 'react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';

import type { ChatMessage } from './types';

/**
 * Single chat-bubble row. User messages right-align with an emerald
 * accent background; assistant messages left-align with a card-style
 * surface. The width caps at 80% so long messages wrap without
 * spilling the bubble across the entire screen.
 */
export function ChatBubble({ message }: { message: ChatMessage }) {
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const isUser = message.role === 'user';

  const bg = isUser
    ? tokens.accent.dashboard
    : isDark
      ? tokens.surface['dark-card']
      : tokens.surface['light-card'];
  const fg = isUser
    ? '#fff'
    : isDark
      ? tokens.surface['dark-fg']
      : tokens.surface['light-fg'];
  const borderColor = isDark
    ? tokens.surface['dark-border']
    : tokens.surface['light-border'];

  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        marginBottom: 8,
      }}
    >
      <View
        style={{
          backgroundColor: bg,
          borderRadius: 14,
          borderTopRightRadius: isUser ? 4 : 14,
          borderTopLeftRadius: isUser ? 14 : 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderWidth: isUser ? 0 : 1,
          borderColor,
        }}
      >
        <Text
          className="font-sans text-sm"
          style={{ color: fg, lineHeight: 20 }}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}
