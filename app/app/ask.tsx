import { useRouter } from 'expo-router';
import { ChevronLeft, Mic, MicOff, Send, Sparkles, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionCard } from '@/features/ask/ActionCard';
import { ChatBubble } from '@/features/ask/ChatBubble';
import { EmptyState } from '@/features/ask/EmptyState';
import { handleAction } from '@/features/ask/actionHandler';
import { buildContextSnapshot } from '@/features/ask/contextSnapshot';
import {
  clearHistory, fetchHistory, GeminiClientError, isConfigured, sendChatMessage,
} from '@/features/ask/geminiClient';
import type { ChatMessage } from '@/features/ask/types';
import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { useVoiceInput } from '@/shared/utils/voiceInput';
import { useAuthUser, useUserDoc } from '@/stores/authStore';

/**
 * /ask — "Tanya Compass" / "Ask Compass" chat screen.
 *
 * Full-screen modal entered from the Insights tab. Conversation
 * persists via Cloudflare KV (ADR-23 §5) so reopening the screen later
 * resumes the last conversation. Up to 10 turns kept; older messages
 * fall off as new ones land.
 *
 * Voice input is hardcoded to id-ID (per voiceInput.native.ts) so users
 * can speak Indonesian regardless of UI locale.
 */

export default function AskScreen() {
  const { t, i18n } = useTranslation(['ask', 'common']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appAlert = useAppAlert();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const userDoc = useUserDoc();
  const wid = user ? `solo-${user.uid}` : null;
  const pinnedGoalId = userDoc?.pinnedGoalId ?? null;

  const fg = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const muted = isDark
    ? tokens.surface['dark-fg-muted']
    : tokens.surface['light-fg-muted'];
  const overlayBg = isDark
    ? tokens.surface['dark-bg']
    : tokens.surface['light-bg'];
  const border = isDark
    ? tokens.surface['dark-border']
    : tokens.surface['light-border'];

  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Voice input → fills the chat input. Indonesian on native (locale
  // arg is ignored by voiceInput.native.ts; web uses it).
  const voice = useVoiceInput({
    locale: lang,
    onResult: (transcript) => {
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    },
  });

  // Initial load — check Worker config + fetch persisted history.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isConfigured();
      if (cancelled) return;
      setConfigured(ok);
      if (!ok) {
        setLoadingHistory(false);
        return;
      }
      try {
        const persisted = await fetchHistory();
        if (!cancelled) setHistory(persisted);
      } catch (err) {
        if (cancelled) return;
        // Non-fatal — empty history is fine, user can start fresh.
        console.warn('[ask] fetch history failed', err);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (history.length > 0) {
      // setTimeout 0 lets the layout settle before scrolling.
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 0);
    }
  }, [history.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !wid || !configured) return;

    // Optimistic render the user message before Gemini responds.
    const optimistic: ChatMessage = {
      role: 'user',
      content: text,
      ts: Date.now(),
    };
    setHistory((prev) => [...prev, optimistic]);
    setInput('');
    setSending(true);

    try {
      const context = await buildContextSnapshot(wid, lang, pinnedGoalId);
      const res = await sendChatMessage(text, context);
      // Worker returns the canonical history (last 10 turns) — replace
      // local state with it so the optimistic msg gets reconciled.
      setHistory(res.history);
    } catch (err) {
      // Roll back the optimistic message on error.
      setHistory((prev) => prev.slice(0, -1));
      const message =
        err instanceof GeminiClientError
          ? `${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : t('errors.sendFailed');
      appAlert(t('errors.sendFailedTitle'), message);
    } finally {
      setSending(false);
    }
  };

  const handleClearHistory = () => {
    if (history.length === 0 || sending) return;
    appAlert(
      t('clearHistory.confirmTitle'),
      t('clearHistory.confirmBody'),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('clearHistory.confirmCta'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await clearHistory();
                setHistory([]);
              } catch (err) {
                appAlert(
                  t('errors.clearFailedTitle'),
                  err instanceof Error ? err.message : t('errors.sendFailed'),
                );
              }
            })();
          },
        },
      ],
    );
  };

  // ---- Render branches ----

  if (configured === null || loadingHistory) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: overlayBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={tokens.accent.dashboard} />
      </View>
    );
  }

  if (configured === false) {
    return (
      <View style={{ flex: 1, backgroundColor: overlayBg }}>
        <ScreenHeader
          title={t('title')}
          onBack={() => router.back()}
          fg={fg}
          insetTop={insets.top}
          showClearButton={false}
        />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Sparkles size={40} color={muted} />
          <Text
            className="font-sans-bold text-xl text-center mt-4"
            style={{ color: fg }}
          >
            {t('notConfigured.title')}
          </Text>
          <Text
            className="font-sans text-sm text-center mt-2"
            style={{ color: muted, maxWidth: 320 }}
          >
            {t('notConfigured.body')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: overlayBg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title={t('title')}
        onBack={() => router.back()}
        onClear={handleClearHistory}
        fg={fg}
        insetTop={insets.top}
        showClearButton={history.length > 0}
      />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {history.length === 0 ? (
          <EmptyState onPickPrompt={(prompt) => setInput(prompt)} />
        ) : (
          <>
            {history.map((m, idx) => (
              <View key={`${m.ts}-${idx}`}>
                <ChatBubble message={m} />
                {m.role === 'assistant' && m.actions && m.actions.length > 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginBottom: 12,
                      marginLeft: 4,
                    }}
                  >
                    {m.actions.map((a, ai) => (
                      <ActionCard
                        key={`${m.ts}-act-${ai}`}
                        action={a}
                        onPress={() => handleAction(router, a)}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
            {sending ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  marginTop: 4,
                  gap: 8,
                }}
              >
                <ActivityIndicator color={tokens.accent.dashboard} />
                <Text
                  className="font-sans text-xs"
                  style={{ color: muted }}
                >
                  {t('thinking')}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Input row */}
      <View
        style={{
          padding: 12,
          paddingBottom: 12 + insets.bottom,
          borderTopWidth: 1,
          borderTopColor: border,
          gap: 8,
        }}
      >
        <View className="self-center w-full max-w-md lg:max-w-3xl">
          <TextField
            label=""
            value={input}
            onChangeText={setInput}
            placeholder={t('inputPlaceholder')}
            autoCapitalize="sentences"
            // Multiline composer — Enter adds a newline, Send button
            // (below) is the only submit affordance. Long prompts /
            // pasted multi-paragraph context now compose comfortably
            // without auto-submitting on first newline.
            multiline
            numberOfLines={2}
          />
          <View className="flex-row" style={{ gap: 8, marginTop: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                voice.isListening
                  ? t('voice.stop')
                  : t('voice.start')
              }
              accessibilityState={{ disabled: !voice.supported || sending }}
              onPress={() => {
                if (sending) return;
                if (!voice.supported) {
                  appAlert(t('voice.unavailableTitle'), t('voice.unavailableBody'));
                  return;
                }
                if (voice.isListening) voice.stop();
                else voice.start();
              }}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: voice.isListening
                  ? tokens.accent.transactions
                  : border,
                backgroundColor: voice.isListening
                  ? tokens.accent.transactions + '22'
                  : 'transparent',
                minHeight: 40,
              }}
            >
              {voice.isListening ? (
                <MicOff size={16} color={tokens.accent.transactions} />
              ) : (
                <Mic size={16} color={muted} />
              )}
              <Text
                className="font-sans-medium text-xs"
                style={{
                  color: voice.isListening ? tokens.accent.transactions : muted,
                }}
              >
                {voice.isListening ? t('voice.stop') : t('voice.button')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('actions.send')}
              accessibilityState={{ disabled: !input.trim() || sending }}
              onPress={handleSend}
              disabled={!input.trim() || sending}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: tokens.accent.dashboard,
                minHeight: 40,
                opacity: !input.trim() || sending ? 0.4 : 1,
              }}
            >
              <Send size={16} color="#fff" />
              <Text className="font-sans-medium text-xs" style={{ color: '#fff' }}>
                {sending ? t('actions.sending') : t('actions.send')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function ScreenHeader({
  title,
  onBack,
  onClear,
  fg,
  insetTop,
  showClearButton,
}: {
  title: string;
  onBack: () => void;
  onClear?: () => void;
  fg: string;
  insetTop: number;
  showClearButton: boolean;
}) {
  return (
    <View
      style={{
        paddingTop: insetTop + 8,
        paddingHorizontal: 12,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Pressable
        accessibilityRole="link"
        onPress={onBack}
        hitSlop={8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 4,
        }}
      >
        <ChevronLeft size={22} color={fg} />
        <Text className="font-sans-medium text-base ml-1" style={{ color: fg }}>
          {title}
        </Text>
      </Pressable>
      {showClearButton && onClear ? (
        <Pressable
          accessibilityRole="button"
          onPress={onClear}
          hitSlop={8}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
          }}
        >
          <Trash2 size={18} color={fg} />
        </Pressable>
      ) : null}
    </View>
  );
}
