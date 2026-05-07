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
  /** Earliest selectable date (inclusive) as 'YYYY-MM-DD'. Days /
   * months / years before this point render dimmed and reject taps.
   * Used by goals to prevent picking past target dates. Omit to
   * allow any date (transactions need to log past spending). */
  minDate?: string;
  /** Latest selectable date (inclusive) as 'YYYY-MM-DD'. Symmetric
   * to minDate. Currently unused but kept for future-proofing. */
  maxDate?: string;
};

/**
 * Themed cross-platform date picker. Three zoom levels — Day view
 * shows a month grid; tap the month/year header to zoom out to Month
 * view (12-month grid); tap the year there to zoom out to Year view
 * (decade grid). Mirrors Google Forms' calendar UX.
 *
 * Same component on web and native — no native datetimepicker
 * dependency, no `<input type="date">` styling drift between
 * browsers.
 *
 * Format convention: stored / emitted as 'YYYY-MM-DD' to match the
 * existing `Goal.targetDate` and `Transaction.date` shapes. Empty
 * string represents 'no date'.
 */
export function DateField({
  value, onChange, placeholder, lang, accessibilityLabel, minDate, maxDate,
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
  // 'day' = month grid; 'month' = month-of-year grid; 'year' = decade
  // grid. Header taps zoom out one level; selecting a cell zooms back
  // in toward 'day'.
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'year'>('day');
  const initialMonth = (() => {
    if (value) {
      const d = parseIso(value);
      if (d) return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  })();
  const [viewMonth, setViewMonth] = useState<Date>(initialMonth);

  const valueDate = useMemo(() => parseIso(value), [value]);
  const minDateParsed = useMemo(() => (minDate ? parseIso(minDate) : null), [minDate]);
  const maxDateParsed = useMemo(() => (maxDate ? parseIso(maxDate) : null), [maxDate]);

  const displayLabel = valueDate
    ? formatDate(valueDate, 'long', lang)
    : (placeholder ?? '');

  // Reset view mode + view month each time the modal opens so a
  // returning user lands on their saved date in day view.
  function openModal() {
    setViewMode('day');
    if (valueDate) {
      setViewMonth(new Date(valueDate.getFullYear(), valueDate.getMonth(), 1));
    } else {
      const now = new Date();
      setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    }
    setOpen(true);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? displayLabel}
        onPress={openModal}
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
            {viewMode === 'day' ? (
              <CalendarDayGrid
                viewMonth={viewMonth}
                setViewMonth={setViewMonth}
                selectedDate={valueDate}
                minDate={minDateParsed}
                maxDate={maxDateParsed}
                onSelect={(iso) => {
                  onChange(iso);
                  setOpen(false);
                }}
                onZoomToMonths={() => setViewMode('month')}
                fgColor={fgColor}
                mutedColor={mutedColor}
                faintColor={faintColor}
                borderColor={borderColor}
                lang={lang}
              />
            ) : viewMode === 'month' ? (
              <CalendarMonthGrid
                viewYear={viewMonth.getFullYear()}
                setViewYear={(y) => setViewMonth(new Date(y, viewMonth.getMonth(), 1))}
                selectedDate={valueDate}
                minDate={minDateParsed}
                maxDate={maxDateParsed}
                onSelect={(month) => {
                  setViewMonth(new Date(viewMonth.getFullYear(), month, 1));
                  setViewMode('day');
                }}
                onZoomToYears={() => setViewMode('year')}
                fgColor={fgColor}
                mutedColor={mutedColor}
                faintColor={faintColor}
                borderColor={borderColor}
                lang={lang}
              />
            ) : (
              <CalendarYearGrid
                centerYear={viewMonth.getFullYear()}
                setCenterYear={(y) => setViewMonth(new Date(y, viewMonth.getMonth(), 1))}
                selectedDate={valueDate}
                minDate={minDateParsed}
                maxDate={maxDateParsed}
                onSelect={(y) => {
                  setViewMonth(new Date(y, viewMonth.getMonth(), 1));
                  setViewMode('month');
                }}
                fgColor={fgColor}
                mutedColor={mutedColor}
                faintColor={faintColor}
                borderColor={borderColor}
              />
            )}

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
                  if (minDateParsed && today < minDateParsed) return;
                  if (maxDateParsed && today > maxDateParsed) return;
                  onChange(formatIso(today));
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

// ---------- CalendarDayGrid ----------

type CalendarDayGridProps = {
  viewMonth: Date;
  setViewMonth: (d: Date) => void;
  selectedDate: Date | null;
  minDate: Date | null;
  maxDate: Date | null;
  onSelect: (iso: string) => void;
  onZoomToMonths: () => void;
  fgColor: string;
  mutedColor: string;
  faintColor: string;
  borderColor: string;
  lang: Locale;
};

function CalendarDayGrid({
  viewMonth, setViewMonth, selectedDate, minDate, maxDate, onSelect, onZoomToMonths,
  fgColor, mutedColor, faintColor, borderColor, lang,
}: CalendarDayGridProps) {
  const accent = tokens.accent.dashboard;
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

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

  return (
    <>
      {/* Header — tappable month label zooms out to month-of-year. */}
      <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => setViewMonth(new Date(year, month - 1, 1))}
          hitSlop={6}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronLeft size={16} color={mutedColor} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch to month picker"
          onPress={onZoomToMonths}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
          }}
        >
          <Text className="font-sans-semibold text-base" style={{ color: fgColor }}>
            {monthLabel} ▾
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => setViewMonth(new Date(year, month + 1, 1))}
          hitSlop={6}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronRight size={16} color={mutedColor} />
        </Pressable>
      </View>

      <View className="flex-row" style={{ marginBottom: 4 }}>
        {dayLabels.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Text className="font-sans-medium text-xs" style={{ color: mutedColor }}>{d}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((cell, idx) => {
          const cellMidnight = new Date(cell.date.getFullYear(), cell.date.getMonth(), cell.date.getDate());
          const isToday = cellMidnight.getTime() === todayMidnight.getTime();
          const isSelected = selectedDate
            && cellMidnight.getFullYear() === selectedDate.getFullYear()
            && cellMidnight.getMonth() === selectedDate.getMonth()
            && cellMidnight.getDate() === selectedDate.getDate();
          const beforeMin = !!minDate && cellMidnight < minDate;
          const afterMax = !!maxDate && cellMidnight > maxDate;
          const disabled = beforeMin || afterMax;
          const dayColor = isSelected
            ? '#fff'
            : disabled
              ? faintColor
              : !cell.inMonth
                ? faintColor
                : isToday
                  ? accent
                  : fgColor;
          return (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              accessibilityLabel={formatDate(cell.date, 'long', lang)}
              disabled={disabled}
              onPress={() => onSelect(formatIso(cell.date))}
              style={{
                width: `${100 / 7}%`,
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 2,
                opacity: disabled && !isSelected ? 0.5 : 1,
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
                <Text className="font-sans-medium text-sm" style={{ color: dayColor }}>
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

// ---------- CalendarMonthGrid ----------

type CalendarMonthGridProps = {
  viewYear: number;
  setViewYear: (y: number) => void;
  selectedDate: Date | null;
  minDate: Date | null;
  maxDate: Date | null;
  onSelect: (month: number) => void;
  onZoomToYears: () => void;
  fgColor: string;
  mutedColor: string;
  faintColor: string;
  borderColor: string;
  lang: Locale;
};

function CalendarMonthGrid({
  viewYear, setViewYear, selectedDate, minDate, maxDate, onSelect, onZoomToYears,
  fgColor, mutedColor, faintColor, borderColor, lang,
}: CalendarMonthGridProps) {
  const accent = tokens.accent.dashboard;
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();

  // Month abbreviations — 3-letter localized.
  const monthLabels = Array.from({ length: 12 }, (_, m) => {
    return formatDate(new Date(viewYear, m, 1), 'long-month', lang).split(' ')[0];
  });

  return (
    <>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous year"
          onPress={() => setViewYear(viewYear - 1)}
          hitSlop={6}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronLeft size={16} color={mutedColor} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch to year picker"
          onPress={onZoomToYears}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
          }}
        >
          <Text className="font-sans-semibold text-base" style={{ color: fgColor }}>
            {viewYear} ▾
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next year"
          onPress={() => setViewYear(viewYear + 1)}
          hitSlop={6}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronRight size={16} color={mutedColor} />
        </Pressable>
      </View>

      {/* 4 rows × 3 columns of month buttons. */}
      <View className="flex-row flex-wrap">
        {monthLabels.map((label, m) => {
          const isCurrent = todayY === viewYear && todayM === m;
          const isSelected = selectedDate
            && selectedDate.getFullYear() === viewYear
            && selectedDate.getMonth() === m;
          // Disabled if every day in the month is below minDate or
          // above maxDate. Cheap check: last day of month vs minDate,
          // first day vs maxDate.
          const lastOfMonth = new Date(viewYear, m + 1, 0);
          const firstOfMonth = new Date(viewYear, m, 1);
          const beforeMin = !!minDate && lastOfMonth < minDate;
          const afterMax = !!maxDate && firstOfMonth > maxDate;
          const disabled = beforeMin || afterMax;
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: !!isSelected }}
              disabled={disabled}
              onPress={() => onSelect(m)}
              style={{
                width: '33.333%',
                paddingHorizontal: 4,
                paddingVertical: 6,
                opacity: disabled && !isSelected ? 0.4 : 1,
              }}
            >
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 14,
                  borderRadius: 10,
                  backgroundColor: isSelected ? accent : 'transparent',
                  borderWidth: !isSelected && isCurrent ? 1 : 0,
                  borderColor: !isSelected && isCurrent ? accent : borderColor,
                }}
              >
                <Text
                  className="font-sans-medium text-sm"
                  style={{
                    color: isSelected
                      ? '#fff'
                      : disabled
                        ? faintColor
                        : isCurrent
                          ? accent
                          : fgColor,
                  }}
                >
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ---------- CalendarYearGrid ----------

type CalendarYearGridProps = {
  centerYear: number;
  setCenterYear: (y: number) => void;
  selectedDate: Date | null;
  minDate: Date | null;
  maxDate: Date | null;
  onSelect: (year: number) => void;
  fgColor: string;
  mutedColor: string;
  faintColor: string;
  borderColor: string;
};

function CalendarYearGrid({
  centerYear, setCenterYear, selectedDate, minDate, maxDate, onSelect,
  fgColor, mutedColor, faintColor, borderColor,
}: CalendarYearGridProps) {
  const accent = tokens.accent.dashboard;
  const today = new Date();
  const todayYear = today.getFullYear();

  // 12-year decade page. Show centerYear in the middle of the grid;
  // 5 years before, 6 years after = 12 cells. prev/next chevrons jump
  // by 12 years.
  const startYear = centerYear - 5;
  const endYear = centerYear + 6;

  return (
    <>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous decade"
          onPress={() => setCenterYear(centerYear - 12)}
          hitSlop={6}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronLeft size={16} color={mutedColor} />
        </Pressable>
        <Text className="font-sans-semibold text-base" style={{ color: fgColor }}>
          {startYear}–{endYear}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next decade"
          onPress={() => setCenterYear(centerYear + 12)}
          hitSlop={6}
          style={{
            width: 32, height: 32, borderRadius: 8,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ChevronRight size={16} color={mutedColor} />
        </Pressable>
      </View>

      {/* 4 rows × 3 columns of year buttons. */}
      <View className="flex-row flex-wrap">
        {Array.from({ length: 12 }, (_, i) => startYear + i).map((y) => {
          const isCurrent = y === todayYear;
          const isSelected = selectedDate && selectedDate.getFullYear() === y;
          // Disabled if every day in the year is outside the bounds.
          const lastOfYear = new Date(y, 11, 31);
          const firstOfYear = new Date(y, 0, 1);
          const beforeMin = !!minDate && lastOfYear < minDate;
          const afterMax = !!maxDate && firstOfYear > maxDate;
          const disabled = beforeMin || afterMax;
          return (
            <Pressable
              key={y}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: !!isSelected }}
              disabled={disabled}
              onPress={() => onSelect(y)}
              style={{
                width: '33.333%',
                paddingHorizontal: 4,
                paddingVertical: 6,
                opacity: disabled && !isSelected ? 0.4 : 1,
              }}
            >
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 14,
                  borderRadius: 10,
                  backgroundColor: isSelected ? accent : 'transparent',
                  borderWidth: !isSelected && isCurrent ? 1 : 0,
                  borderColor: !isSelected && isCurrent ? accent : borderColor,
                }}
              >
                <Text
                  className="font-sans-medium text-sm"
                  style={{
                    color: isSelected
                      ? '#fff'
                      : disabled
                        ? faintColor
                        : isCurrent
                          ? accent
                          : fgColor,
                  }}
                >
                  {y}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

/** Parse 'YYYY-MM-DD' as a local-midnight Date, or return null if
 * the input is empty / invalid. */
function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
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
