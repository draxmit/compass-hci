import { Plus, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';

import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Text } from '@/shared/ui/Text';
import { normaliseTag } from '@/shared/utils/tags';

export type TagsInputProps = {
  /** Current tag list (already normalised). */
  value: string[];
  /** Setter — receives the normalised + deduped next list. */
  onChange: (next: string[]) => void;
  /** Tag suggestions surfaced as autocomplete chips. Already-applied
   * tags are filtered out by the component, so callers can pass the
   * full known-tag set without pre-filtering. */
  suggestions: string[];
  accent: string;
};

/**
 * Chip-style multi-tag input (ADR-17). Shows current tags as
 * dismissable chips, a new-tag text field, and a row of suggestion
 * chips below. Pattern modelled on Slack / GitHub label inputs.
 *
 * Submission triggers:
 *   - `Enter` / `,` / `space` in the text field (kept commit-on-comma
 *     behaviour familiar from email clients) commits the typed value
 *   - tapping a suggestion adds it to `value`
 *   - tapping `×` on a chip removes that tag
 *
 * Suggestion list is capped at 8 to keep the chip row scannable on
 * mobile; `_layout.tsx` is the only consumer right now and the
 * full list passes by `collectTagFrequencies`-sorted descending.
 */
export function TagsInput({ value, onChange, suggestions, accent }: TagsInputProps) {
  const { t } = useTranslation(['transactions']);
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark
    ? tokens.surface['dark-fg-muted']
    : tokens.surface['light-fg-muted'];
  const borderColor = isDark
    ? tokens.surface['dark-border']
    : tokens.surface['light-border'];
  const fillColor = isDark
    ? tokens.surface['dark-input']
    : tokens.surface['light-input'];

  const [draft, setDraft] = useState('');

  const filteredSuggestions = useMemo(
    () => suggestions
      .filter((s) => !value.includes(s))
      .filter((s) => draft.length === 0 || s.includes(normaliseTag(draft)))
      .slice(0, 8),
    [suggestions, value, draft],
  );

  const commit = (raw: string) => {
    const n = normaliseTag(raw);
    if (n.length === 0) return;
    if (value.includes(n)) {
      setDraft('');
      return;
    }
    onChange([...value, n]);
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <View>
      {/* Current tag chips + input */}
      <View
        style={{
          borderWidth: 1,
          borderColor,
          backgroundColor: fillColor,
          borderRadius: 10,
          padding: 8,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          minHeight: 44,
        }}
      >
        {value.map((tag) => (
          <View
            key={tag}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingLeft: 8,
              paddingRight: 4,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: accent + '22',
            }}
          >
            <Text className="font-sans-medium text-xs" style={{ color: accent }}>
              {tag}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('transactions:entry.tags.remove', { tag })}
              onPress={() => remove(tag)}
              hitSlop={6}
              style={{ padding: 2 }}
            >
              <X size={12} color={accent} />
            </Pressable>
          </View>
        ))}
        <TextInput
          value={draft}
          onChangeText={(text) => {
            // Commit-on-comma / commit-on-space behaviour (email-client
            // pattern). The committed substring is everything before the
            // separator; the separator itself is dropped.
            if (text.endsWith(',') || text.endsWith(' ')) {
              commit(text.slice(0, -1));
              return;
            }
            setDraft(text);
          }}
          onSubmitEditing={() => commit(draft)}
          // Backspace on empty draft removes the last applied tag —
          // common UX pattern in chip inputs (Slack, Notion, GitHub).
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && draft.length === 0 && value.length > 0) {
              remove(value[value.length - 1]!);
            }
          }}
          placeholder={value.length === 0
            ? t('transactions:entry.tags.placeholder')
            : t('transactions:entry.tags.placeholderMore')}
          placeholderTextColor={mutedColor}
          style={{
            flex: 1,
            minWidth: 80,
            color: fgColor,
            paddingVertical: 4,
            paddingHorizontal: 4,
            fontSize: 14,
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
          underlineColorAndroid="transparent"
        />
      </View>

      {/* Suggestion chips */}
      {filteredSuggestions.length > 0 ? (
        <View
          className="flex-row flex-wrap mt-2"
          style={{ gap: 6 }}
        >
          {filteredSuggestions.map((sug) => (
            <Pressable
              key={sug}
              accessibilityRole="button"
              accessibilityLabel={t('transactions:entry.tags.add', { tag: sug })}
              onPress={() => commit(sug)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor,
                minHeight: 30,
              }}
            >
              <Plus size={12} color={mutedColor} />
              <Text className="font-sans text-xs" style={{ color: fgColor }}>
                {sug}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
