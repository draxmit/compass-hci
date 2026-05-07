import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import type { Locale } from '@/shared/i18n';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { formatDate } from '@/shared/utils/formatDate';

import { Text } from './Text';

export type DateFieldProps = {
  /** ISO date 'YYYY-MM-DD' or empty string for no date. */
  value: string;
  /** Called with 'YYYY-MM-DD' or '' when cleared. */
  onChange: (next: string) => void;
  placeholder?: string;
  lang: Locale;
  accessibilityLabel?: string;
};

/**
 * Themed cross-platform date picker. Tap the field to open a modal
 * calendar grid; tap a day to commit. Today + selected day get
 * distinct visual treatment. Clear button removes the date. Same
 * component on web and native — no native datetimepicker dependency,
 * no `<input type="date">` styling drift between browsers.
 *
 * Format convention: stored / emitted as 'YYYY-MM-DD' to match the
 * existing `Goal.targetDate` and `Transaction.date` shapes. Empty
 * string represents 'no date'.
 */
export function DateField({
  value, onChange, placeholder, lang, accessibilityLabel,
}: DateFieldProps) {
  const { t } = useTranslation(['common']);
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark
    ? tokens.surface['dark-fg-muted']
    : tokens.surface['light-fg-muted'];
  const faintColor = isDark
    ? tokens.surface['dark-fg-faint']
    : tokens.surface['light-fg-faint'];
  const borderColor = isDark
    ? tokens.surface['dark-border']
    : tokens.surface['light-border'];
  const overlayBg = isDark
    ? tokens.surface['dark-bg']
    : tokens.surface['light-bg'];
  const inputBg = isDark
    ? tokens.surface['dark-input']
    : tokens.surface['light-input'];

  const [open, setOpen] = useState(false);
  // Month being viewed in the calendar — separate from `value` so the
  // user can flip months without selecting yet. Initialised to the
  // selected month (or current month if nothing selected).
  const initialMonth = (() => {
    if (value) {
      const d = new Date(`${value}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  })();
  const [viewMonth, setViewMonth] = useState<Date>(initialMonth);

  const valueDate = useMemo(() => {
    if (!value) return null;
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [value]);

  const displayLabel = valueDate
    ? formatDate(valueDate, 'long', lang)
    : (placeholder ?? '');

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? displayLabel}
        onPress={() => {
          // Reset view to the selected month each time we open so a
          // returning user lands on their saved month.
          if (valueDate) {
            setViewMonth(new Date(valueDate.getFullYear(), valueDate.getMonth(), 1));
          }
          setOpen(true);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          backgroundColor: inputBg,
          minHeight: 44,
        }}
      >
        <Calendar size={16} color={mutedColor} />
        <Text
          className="font-sans text-base flex-1"
          style={{ color: valueDate ? fgColor : faintColor }}
          numberOfLines={1}
        >
          {displayLabel || ' '}
        </Text>
        {valueDate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.cancel')}
            onPress={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            hitSlop={6}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={14} color={mutedColor} />
          </Pressable>
        ) : null}
      </Pressable>

      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        animationType="fade"
        transparent
      >
        <Pressable
          accessibilityLabel={t('common:actions.cancel')}
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
          }}
        >
          <Pressable
            onPress={() => { /* swallow */ }}
            style={{
              width: '100%',
              maxWidth: 360,
              borderRadius: 16,
              backgroundColor: overlayBg,
              padding: 16,
            }}
          >
            <CalendarGrid
              viewMonth={viewMonth}
              setViewMonth={setViewMonth}
              selectedDate={valueDate}
              onSelect={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
              fgColor={fgColor}
              mutedColor={mutedColor}
              faintColor={faintColor}
              borderColor={borderColor}
              lang={lang}
              t={t}
            />
            <View
              className="flex-row items-center justify-between"
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: borderColor,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const today = new Date();
                  const iso = formatIso(today);
                  onChange(iso);
                  setOpen(false);
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  className="font-sans-medium text-sm"
                  style={{ color: tokens.accent.dashboard }}
                >
                  {t('common:actions.today')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                }}
              >
                <Text
                  className="font-sans-medium text-sm"
                  style={{ color: mutedColor }}
                >
                  {t('common:actions.cancel')}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ---------- CalendarGrid ----------

type CalendarGridProps = {
  viewMonth: Date;
  setViewMonth: (d: Date) => void;
  selectedDate: Date | null;
  onSelect: (iso: string) => void;
  fgColor: string;
  mutedColor: string;
  faintColor: string;
  borderColor: string;
  lang: Locale;
  t: (key: string) => string;
};

function CalendarGrid({
  viewMonth, setViewMonth, selectedDate, onSelect,
  fgColor, mutedColor, faintColor, borderColor, lang, t,
}: CalendarGridProps) {
  void t;
  const accent = tokens.accent.dashboard;
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  // First day of month + how many days to backfill from prev month so
  // the grid starts on Sunday. Indonesian convention is also Sun-first
  // for most calendars (printed + digital), so no locale flip.
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // 6×7 grid = 42 cells. Days from prev month, current month, next
  // month — caller renders all of them, dimming the non-current ones.
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length < 42) {
    const nextDay = cells.length - startWeekday - daysInMonth + 1;
    cells.push({ date: new Date(year, month + 1, nextDay), inMonth: false });
  }

  const dayLabels = lang === 'id'
    ? ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const monthLabel = formatDate(firstOfMonth, 'long-month', lang);

  const goPrev = () => setViewMonth(new Date(year, month - 1, 1));
  const goNext = () => setViewMonth(new Date(year, month + 1, 1));

  return (
    <>
      {/* Header — month label centered, prev/next arrows on each side. */}
      <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={goPrev}
          hitSlop={6}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronLeft size={16} color={mutedColor} />
        </Pressable>
        <Text className="font-sans-semibold text-base" style={{ color: fgColor }}>
          {monthLabel}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={goNext}
          hitSlop={6}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronRight size={16} color={mutedColor} />
        </Pressable>
      </View>

      {/* Day-of-week labels */}
      <View className="flex-row" style={{ marginBottom: 4 }}>
        {dayLabels.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Text
              className="font-sans-medium text-xs"
              style={{ color: mutedColor }}
            >
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      <View className="flex-row flex-wrap">
        {cells.map((cell, idx) => {
          const isToday = cell.date.getFullYear() === todayY
            && cell.date.getMonth() === todayM
            && cell.date.getDate() === todayD;
          const isSelected = selectedDate
            && cell.date.getFullYear() === selectedDate.getFullYear()
            && cell.date.getMonth() === selectedDate.getMonth()
            && cell.date.getDate() === selectedDate.getDate();
          const dayColor = isSelected
            ? '#fff'
            : !cell.inMonth
              ? faintColor
              : isToday
                ? accent
                : fgColor;
          return (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityLabel={formatDate(cell.date, 'long', lang)}
              onPress={() => onSelect(formatIso(cell.date))}
              style={{
                width: `${100 / 7}%`,
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 2,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? accent : 'transparent',
                  borderWidth: !isSelected && isToday ? 1 : 0,
                  borderColor: !isSelected && isToday ? accent : borderColor,
                }}
              >
                <Text
                  className="font-sans-medium text-sm"
                  style={{ color: dayColor }}
                >
                  {cell.date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

/**
 * Format a Date as 'YYYY-MM-DD' in local time. Same convention as
 * Transaction.date and Goal.targetDate everywhere else in the app.
 */
function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
