import type {
  Account, Category, SavedFilter, Transaction, TransactionType,
} from '@compass/shared-types';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { Bookmark, BookmarkPlus, ChevronDown, Plus, SlidersHorizontal, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated, Modal, PanResponder, Pressable, ScrollView, TextInput, View,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { subscribeAccounts } from '@/services/firestore/accountsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import {
  createSavedFilter, deleteSavedFilter, subscribeSavedFilters,
} from '@/services/firestore/savedFiltersService';
import { subscribeRecent } from '@/services/firestore/transactionsService';
import { useAuthUser, useUserDoc } from '@/stores/authStore';
import { useIsDesktop } from '@/shared/hooks/useBreakpoint';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { DateField } from '@/shared/ui/DateField';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatDate } from '@/shared/utils/formatDate';
import { formatAmountForDisplay } from '@/shared/utils/formatAmountForDisplay';
import { collectTagFrequencies } from '@/shared/utils/tags';

type TypeFilter = 'all' | TransactionType;
type DateFilter =
  | 'this_month' | 'last_month' | 'last_3_months'
  | 'this_year' | 'last_year' | 'all_time' | 'custom';

/**
 * (tabs)/transactions.tsx — recent transactions list with chip filters
 * + tap-to-edit. Subscribes to the most recent 500 transactions across
 * all months; filters run client-side.
 *
 * v3 polish (was 50 in v1): the recent-50 cap meant 'All time' filter
 * actually returned 'last 50' which surprised users when older data
 * existed (the year heatmap could see it but the Transactions tab
 * couldn't). Bumped to 500 — typical user has well under that, and
 * 500 docs of ~500 bytes is ~250KB on cold-load which is fine on
 * Spark (50k reads/day budget). When a power user crosses that we
 * can swap in a paged 'load older' affordance.
 */
export default function TransactionsScreen() {
  const { t, i18n } = useTranslation(['transactions', 'accounts', 'common']);
  const router = useRouter();
  const appAlert = useAppAlert();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const userDoc = useUserDoc();
  const displayInIDR = userDoc?.displayInIDR ?? false;
  const wid = user ? `solo-${user.uid}` : null;
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  // Mobile-only: filters live behind a single 'Filters' button + bottom-
  // sheet rather than 5 inline pills. Desktop has horizontal real estate
  // for the pill row.
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  // Drag-to-close gesture for the sheet handle. The Animated.Value
  // tracks the user's downward drag; on release we either spring back
  // to 0 (dismiss) or close the modal (if dragged past threshold).
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetPanResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gesture) =>
        gesture.dy > 4 && Math.abs(gesture.dx) < Math.abs(gesture.dy),
      onPanResponderMove: (_e, gesture) => {
        // Clamp upward drag to 0 — sheet shouldn't fly off the top.
        sheetTranslateY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_e, gesture) => {
        const shouldClose = gesture.dy > 100 || gesture.vy > 0.5;
        if (shouldClose) {
          Animated.timing(sheetTranslateY, {
            toValue: 600,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            setFiltersSheetOpen(false);
            // Reset for the next open.
            sheetTranslateY.setValue(0);
          });
        } else {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    }),
    [sheetTranslateY],
  );
  // Reset drag offset whenever the sheet opens — covers the case where
  // a previous close animation left it at a non-zero value.
  useEffect(() => {
    if (filtersSheetOpen) sheetTranslateY.setValue(0);
  }, [filtersSheetOpen, sheetTranslateY]);

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // First-emission flag for the transactions subscription. Without it
  // the empty-welcome card flashes for ~50–100 ms before Firestore's
  // first snapshot lands. Accounts + categories don't need their own
  // flags here — they're only used for row rendering, not for the
  // empty-state branch.
  const [txsLoaded, setTxsLoaded] = useState(false);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('this_month');
  // Custom date range — only used when dateFilter === 'custom'. Both
  // are inclusive 'YYYY-MM-DD' strings. Null = picker not yet set.
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  // Active preset id when one was just applied — drives the filled
  // bookmark icon. Cleared on any filter change so the chip "deselects"
  // when the user adjusts a filter manually.
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  // Save-as-preset inline editor state. `null` means closed.
  const [savePresetDraft, setSavePresetDraft] = useState<string | null>(null);
  // Selected tags — AND-semantics with the other filters; ANY-semantics
  // within: a tx matches if ANY of the selected tags appears in its
  // tag list. (Most users picking 2+ tags want "either/or" not "both",
  // matching how email-client tag filters work.)
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  // v3 phase A — 5: category + account multi-select filters. Same
  // ANY-semantics as tags. Empty array = no constraint. Together with
  // the existing dimensions these comprise the "advanced query" v3
  // promised — visual filter rules composing AND across dimensions.
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  // Which filter pill (if any) is currently expanded. Only one open at a
  // time — Mercury/Linear-style dropdown chip pattern.
  const [openFilter, setOpenFilter] = useState<
    'type' | 'date' | 'tags' | 'category' | 'account' | null
  >(null);

  useEffect(() => {
    if (!wid) return;
    const unsubT = subscribeRecent(wid, 500, (data) => {
      setTxs(data);
      setTxsLoaded(true);
    });
    const unsubA = subscribeAccounts(wid, setAccounts);
    const unsubC = subscribeCategories(wid, setCategories);
    const unsubS = subscribeSavedFilters(wid, setSavedFilters);
    return () => { unsubT(); unsubA(); unsubC(); unsubS(); };
  }, [wid]);

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const now = new Date();
    const thisYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastYearMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const thisYear = now.getFullYear();
    // 3-month cutoff: 1st day of the month 3 months back, inclusive.
    // i.e. May 2026 → cutoff = '2026-03-01' (covers Mar/Apr/May).
    const threeMonthsAgo = new Date(thisYear, now.getMonth() - 2, 1);
    const threeMonthsAgoISO = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
    const thisYearStartISO = `${thisYear}-01-01`;
    const lastYearStartISO = `${thisYear - 1}-01-01`;
    const lastYearEndISO = `${thisYear - 1}-12-31`;
    const lower = search.trim().toLowerCase();

    return txs.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      // Date filter — each branch is independent so we can evaluate
      // by the simplest predicate available.
      if (dateFilter === 'this_month' && tx.yearMonth !== thisYearMonth) return false;
      if (dateFilter === 'last_month' && tx.yearMonth !== lastYearMonth) return false;
      if (dateFilter === 'last_3_months' && tx.date < threeMonthsAgoISO) return false;
      if (dateFilter === 'this_year' && tx.date < thisYearStartISO) return false;
      if (dateFilter === 'last_year' && (tx.date < lastYearStartISO || tx.date > lastYearEndISO)) return false;
      if (dateFilter === 'custom') {
        if (customFrom && tx.date < customFrom) return false;
        if (customTo && tx.date > customTo) return false;
      }
      if (lower && !tx.description.toLowerCase().includes(lower)) return false;
      if (tagFilter.length > 0) {
        const txTags = tx.tags ?? [];
        const anyMatch = tagFilter.some((t) => txTags.includes(t));
        if (!anyMatch) return false;
      }
      // v3 phase A — 5: category filter. ANY-match across the tx's
      // splits (a multi-split tx hitting any selected category counts).
      if (categoryFilter.length > 0) {
        const splitCats = tx.splits.map((s) => s.categoryId);
        const anyCat = categoryFilter.some((c) => splitCats.includes(c));
        if (!anyCat) return false;
      }
      // v3 phase A — 5: account filter. Both source AND destination
      // for transfers — picking 'BCA' should surface "BCA → GoPay"
      // transfers regardless of direction.
      if (accountFilter.length > 0) {
        const matchesSource = accountFilter.includes(tx.accountId);
        const matchesDest = tx.toAccountId
          ? accountFilter.includes(tx.toAccountId)
          : false;
        if (!matchesSource && !matchesDest) return false;
      }
      return true;
    });
  }, [txs, typeFilter, dateFilter, customFrom, customTo, search, tagFilter, categoryFilter, accountFilter]);

  // Tag-suggestion list for the tag-filter picker — frequencies across
  // ALL loaded txs (the recent-50 slice), not just the currently
  // filtered set. Otherwise applying one tag filter would empty the
  // "available tags" list.
  const tagFrequencies = useMemo(() => collectTagFrequencies(txs), [txs]);

  // Clear the active-preset highlight when the user manually diverges
  // from the preset's stored config. Otherwise a tweaked filter would
  // still claim the preset's chip is "active". Cheap shallow compare;
  // the tag-array order check uses every() because tags are unsorted
  // but ANY-semantics make order irrelevant.
  useEffect(() => {
    if (!activePresetId) return;
    const preset = savedFilters.find((p) => p.id === activePresetId);
    if (!preset) {
      setActivePresetId(null);
      return;
    }
    // Helper for ANY-match array equality — order-insensitive since
    // these are conceptually sets, not lists.
    const presetCats = preset.categoryFilter ?? [];
    const presetAccs = preset.accountFilter ?? [];
    const matches =
      preset.search === search
      && preset.typeFilter === typeFilter
      && preset.dateFilter === dateFilter
      && (preset.customFrom ?? null) === customFrom
      && (preset.customTo ?? null) === customTo
      && preset.tagFilter.length === tagFilter.length
      && preset.tagFilter.every((t) => tagFilter.includes(t))
      && presetCats.length === categoryFilter.length
      && presetCats.every((c) => categoryFilter.includes(c))
      && presetAccs.length === accountFilter.length
      && presetAccs.every((a) => accountFilter.includes(a));
    if (!matches) setActivePresetId(null);
  }, [
    activePresetId, savedFilters, search, typeFilter, dateFilter,
    customFrom, customTo, tagFilter, categoryFilter, accountFilter,
  ]);

  const applyPreset = (preset: SavedFilter) => {
    setSearch(preset.search);
    setTypeFilter(preset.typeFilter);
    setDateFilter(preset.dateFilter);
    setCustomFrom(preset.customFrom ?? null);
    setCustomTo(preset.customTo ?? null);
    setTagFilter(preset.tagFilter);
    setCategoryFilter(preset.categoryFilter ?? []);
    setAccountFilter(preset.accountFilter ?? []);
    setActivePresetId(preset.id);
    setOpenFilter(null);
  };

  const handleSavePreset = async (name: string) => {
    if (!wid) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    try {
      const id = await createSavedFilter(wid, {
        name: trimmed,
        search,
        typeFilter,
        dateFilter,
        customFrom,
        customTo,
        tagFilter,
        categoryFilter,
        accountFilter,
      });
      setActivePresetId(id);
      setSavePresetDraft(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('transactions:presets.saveFailed');
      appAlert(t('transactions:presets.saveFailedTitle'), msg);
    }
  };

  const handleDeletePreset = (preset: SavedFilter) => {
    if (!wid) return;
    appAlert(
      t('transactions:presets.deleteConfirmTitle'),
      t('transactions:presets.deleteConfirmBody', { name: preset.name }),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('transactions:presets.delete'),
          style: 'destructive',
          onPress: () => {
            void deleteSavedFilter(wid, preset.id).catch(() => { /* best-effort */ });
            if (activePresetId === preset.id) setActivePresetId(null);
          },
        },
      ],
    );
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const list = groups.get(tx.date) ?? [];
      list.push(tx);
      groups.set(tx.date, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const filtersDirty =
    search.trim() !== ''
    || typeFilter !== 'all'
    || dateFilter !== 'this_month'
    || tagFilter.length > 0
    || categoryFilter.length > 0
    || accountFilter.length > 0;

  // Single reset path used by the inline X-button on the filter pill row
  // AND the 'Clear filters' CTA inside the no-results card.
  const resetFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setDateFilter('this_month');
    setCustomFrom(null);
    setCustomTo(null);
    setTagFilter([]);
    setCategoryFilter([]);
    setAccountFilter([]);
    setOpenFilter(null);
  };

  const typeChips: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: t('transactions:filters.allTypes') },
    { key: 'expense', label: t('transactions:entry.types.expense') },
    { key: 'income', label: t('transactions:entry.types.income') },
    { key: 'transfer', label: t('transactions:entry.types.transfer') },
  ];

  const dateChips: { key: DateFilter; label: string }[] = [
    { key: 'this_month', label: t('transactions:filters.thisMonth') },
    { key: 'last_month', label: t('transactions:filters.lastMonth') },
    { key: 'last_3_months', label: t('transactions:filters.last3Months') },
    { key: 'this_year', label: t('transactions:filters.thisYear') },
    { key: 'last_year', label: t('transactions:filters.lastYear') },
    { key: 'all_time', label: t('transactions:filters.allTime') },
    { key: 'custom', label: t('transactions:filters.custom') },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
      <View className="self-center w-full max-w-md lg:max-w-3xl">
        {/* Title now lives in MobileTopBar — no screen-level duplication. */}

        {/* Search — bare TextField; Card-wrap was making it look like a
            nested box. Hidden when there are no transactions to filter. */}
        {txs.length > 0 ? (
          <View className="mb-3">
            <TextField
              label=""
              value={search}
              onChangeText={setSearch}
              placeholder={t('transactions:filters.search')}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
        ) : null}

        {/* Saved-filter chips (ADR-18) — quick-apply common queries.
            Hidden when there are no presets AND no dirty filters to
            save. The Save chip appears at the end of the row when
            filters are dirty + nothing matches. */}
        {txs.length > 0 && (savedFilters.length > 0 || filtersDirty) ? (
          <View className="mb-3">
            {savePresetDraft !== null ? (
              <View
                className="flex-row items-center mb-2"
                style={{ gap: 8 }}
              >
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: tokens.accent.transactions,
                    backgroundColor: tokens.accent.transactions + '14',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    minHeight: 36,
                  }}
                >
                  <BookmarkPlus size={14} color={tokens.accent.transactions} />
                  <TextInput
                    value={savePresetDraft}
                    onChangeText={setSavePresetDraft}
                    placeholder={t('transactions:presets.savePlaceholder')}
                    placeholderTextColor={mutedColor}
                    autoFocus
                    onSubmitEditing={() => {
                      if (savePresetDraft && savePresetDraft.trim().length > 0) {
                        void handleSavePreset(savePresetDraft);
                      }
                    }}
                    returnKeyType="done"
                    style={{
                      flex: 1,
                      color: fgColor,
                      fontSize: 13,
                      paddingVertical: 0,
                      paddingHorizontal: 0,
                    }}
                    underlineColorAndroid="transparent"
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('transactions:presets.saveAction')}
                  onPress={() => {
                    if (savePresetDraft && savePresetDraft.trim().length > 0) {
                      void handleSavePreset(savePresetDraft);
                    }
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 16,
                    backgroundColor: tokens.accent.transactions,
                    minHeight: 36,
                    justifyContent: 'center',
                  }}
                >
                  <Text className="font-sans-medium text-xs text-white">
                    {t('transactions:presets.saveAction')}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('transactions:presets.cancelAction')}
                  onPress={() => setSavePresetDraft(null)}
                  hitSlop={6}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={14} color={mutedColor} />
                </Pressable>
              </View>
            ) : null}
            {/* Preset chips — horizontal scroll instead of wrap so a
                long preset list doesn't stack into multiple rows. The
                Save CTA chip lives at the end of the same scroller
                when filters are dirty + nothing matches. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingRight: 4 }}
            >
              {savedFilters.map((preset) => {
                const active = preset.id === activePresetId;
                return (
                  <View
                    key={preset.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: active ? tokens.accent.transactions : borderColor,
                      backgroundColor: active
                        ? tokens.accent.transactions + '14'
                        : 'transparent',
                      minHeight: 32,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Tap = apply preset. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={preset.name}
                      onPress={() => applyPreset(preset)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingLeft: 10,
                        paddingRight: 4,
                        paddingVertical: 6,
                        minHeight: 32,
                      }}
                    >
                      <Bookmark
                        size={12}
                        color={active ? tokens.accent.transactions : mutedColor}
                        fill={active ? tokens.accent.transactions : 'transparent'}
                      />
                      <Text
                        className="font-sans-medium text-xs"
                        style={{
                          color: active ? tokens.accent.transactions : fgColor,
                        }}
                      >
                        {preset.name}
                      </Text>
                    </Pressable>
                    {/* Explicit delete X — visible always, with hit-slop
                        so it's tappable on mobile. stopPropagation
                        keeps the parent chip's apply handler from
                        firing on accidental edge taps. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('transactions:presets.delete')}
                      onPress={(e: GestureResponderEvent) => {
                        e.stopPropagation();
                        handleDeletePreset(preset);
                      }}
                      hitSlop={6}
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 6,
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 32,
                      }}
                    >
                      <X
                        size={12}
                        color={active ? tokens.accent.transactions : mutedColor}
                      />
                    </Pressable>
                  </View>
                );
              })}
              {filtersDirty && activePresetId === null && savePresetDraft === null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('transactions:presets.saveCta')}
                  onPress={() => setSavePresetDraft('')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor,
                    borderStyle: 'dashed',
                    minHeight: 32,
                  }}
                >
                  <BookmarkPlus size={12} color={mutedColor} />
                  <Text
                    className="font-sans text-xs"
                    style={{ color: mutedColor }}
                  >
                    {t('transactions:presets.saveCta')}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        ) : null}

        {/* Filters — desktop has horizontal real estate for an inline
            pill row; mobile collapses everything behind a single
            'Filters' button + bottom-sheet modal. The active-filter
            count is shown as a small badge on the button so the user
            can scan whether anything is filtering at a glance. */}
        {txs.length > 0 ? (
          isDesktop ? (
            <>
              <View className="flex-row flex-wrap items-center mb-2" style={{ gap: 6 }}>
                <FilterPill
                  label={t('transactions:entry.fields.type')}
                  value={typeChips.find((c) => c.key === typeFilter)?.label ?? ''}
                  isActive={typeFilter !== 'all'}
                  open={openFilter === 'type'}
                  onPress={() => setOpenFilter((cur) => (cur === 'type' ? null : 'type'))}
                  isDark={isDark}
                />
                <FilterPill
                  label={t('transactions:entry.fields.date')}
                  value={
                    dateFilter === 'custom' && (customFrom || customTo)
                      ? `${customFrom ?? '…'} → ${customTo ?? '…'}`
                      : dateChips.find((c) => c.key === dateFilter)?.label ?? ''
                  }
                  isActive={dateFilter !== 'this_month'}
                  open={openFilter === 'date'}
                  onPress={() => setOpenFilter((cur) => (cur === 'date' ? null : 'date'))}
                  isDark={isDark}
                />
                <FilterPill
                  label={t('transactions:filters.tagsLabel')}
                  value={tagFilter.length === 0
                    ? t('transactions:filters.tagsAll')
                    : t('transactions:filters.tagsCount', { count: tagFilter.length, context: tagFilter.length === 1 ? 'one' : 'other' })}
                  isActive={tagFilter.length > 0}
                  open={openFilter === 'tags'}
                  onPress={() => setOpenFilter((cur) => (cur === 'tags' ? null : 'tags'))}
                  isDark={isDark}
                />
                <FilterPill
                  label={t('transactions:filters.categoryLabel')}
                  value={categoryFilter.length === 0
                    ? t('transactions:filters.categoryAll')
                    : t('transactions:filters.categoryCount', { count: categoryFilter.length, context: categoryFilter.length === 1 ? 'one' : 'other' })}
                  isActive={categoryFilter.length > 0}
                  open={openFilter === 'category'}
                  onPress={() => setOpenFilter((cur) => (cur === 'category' ? null : 'category'))}
                  isDark={isDark}
                />
                <FilterPill
                  label={t('transactions:filters.accountLabel')}
                  value={accountFilter.length === 0
                    ? t('transactions:filters.accountAll')
                    : t('transactions:filters.accountCount', { count: accountFilter.length, context: accountFilter.length === 1 ? 'one' : 'other' })}
                  isActive={accountFilter.length > 0}
                  open={openFilter === 'account'}
                  onPress={() => setOpenFilter((cur) => (cur === 'account' ? null : 'account'))}
                  isDark={isDark}
                />
                {filtersDirty ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('transactions:filters.clear')}
                    onPress={resetFilters}
                    hitSlop={8}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: 'auto',
                    }}
                  >
                    <X size={12} color={mutedColor} />
                  </Pressable>
                ) : null}
              </View>

              {/* Expanded options for the open pill (desktop only — mobile
                  uses the bottom sheet below where every panel is shown
                  stacked). */}
              {openFilter === 'type' ? (
                <FilterOptionPanel
                  options={typeChips}
                  selectedKey={typeFilter}
                  onSelect={(key) => {
                    setTypeFilter(key);
                    setOpenFilter(null);
                  }}
                  isDark={isDark}
                />
              ) : null}
              {openFilter === 'date' ? (
                <DateFilterSection
                  dateChips={dateChips}
                  dateFilter={dateFilter}
                  setDateFilter={(key) => {
                    setDateFilter(key);
                    // Stay open if user picked 'custom' so the from/to
                    // pickers are visible immediately. Otherwise close.
                    if (key !== 'custom') setOpenFilter(null);
                  }}
                  customFrom={customFrom}
                  customTo={customTo}
                  setCustomFrom={setCustomFrom}
                  setCustomTo={setCustomTo}
                  isDark={isDark}
                  lang={lang}
                  t={t}
                />
              ) : null}
              {openFilter === 'tags' ? (
                <TagFilterPanel
                  tagFrequencies={tagFrequencies}
                  selectedTags={tagFilter}
                  onToggle={(tag) => {
                    setTagFilter((cur) => (cur.includes(tag)
                      ? cur.filter((t) => t !== tag)
                      : [...cur, tag]));
                  }}
                  isDark={isDark}
                  t={t}
                />
              ) : null}
              {openFilter === 'category' ? (
                <CategoryFilterPanel
                  categories={categories}
                  selectedCategoryIds={categoryFilter}
                  onToggle={(catId) => {
                    setCategoryFilter((cur) => (cur.includes(catId)
                      ? cur.filter((c) => c !== catId)
                      : [...cur, catId]));
                  }}
                  isDark={isDark}
                  lang={lang}
                  t={t}
                />
              ) : null}
              {openFilter === 'account' ? (
                <AccountFilterPanel
                  accounts={accounts}
                  selectedAccountIds={accountFilter}
                  onToggle={(accId) => {
                    setAccountFilter((cur) => (cur.includes(accId)
                      ? cur.filter((a) => a !== accId)
                      : [...cur, accId]));
                  }}
                  isDark={isDark}
                  t={t}
                />
              ) : null}

              <View className="mb-3" />
            </>
          ) : (
            // ----- MOBILE: single Filters button + bottom sheet -----
            <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('transactions:filters.openSheet')}
                onPress={() => setFiltersSheetOpen(true)}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: filtersDirty ? tokens.accent.dashboard : borderColor,
                  backgroundColor: filtersDirty ? tokens.accent.dashboard + '14' : 'transparent',
                  minHeight: 36,
                }}
              >
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <SlidersHorizontal
                    size={14}
                    color={filtersDirty ? tokens.accent.dashboard : mutedColor}
                  />
                  <Text
                    className="font-sans-medium text-sm"
                    style={{ color: filtersDirty ? tokens.accent.dashboard : fgColor }}
                  >
                    {t('transactions:filters.openSheet')}
                  </Text>
                </View>
                {(() => {
                  const activeCount =
                    (typeFilter !== 'all' ? 1 : 0)
                    + (dateFilter !== 'this_month' ? 1 : 0)
                    + (tagFilter.length > 0 ? 1 : 0)
                    + (categoryFilter.length > 0 ? 1 : 0)
                    + (accountFilter.length > 0 ? 1 : 0);
                  if (activeCount === 0) return null;
                  return (
                    <View
                      style={{
                        minWidth: 20,
                        height: 20,
                        paddingHorizontal: 6,
                        borderRadius: 10,
                        backgroundColor: tokens.accent.dashboard,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text className="font-sans-bold text-[11px]" style={{ color: '#fff' }}>
                        {activeCount}
                      </Text>
                    </View>
                  );
                })()}
              </Pressable>
              {filtersDirty ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('transactions:filters.clear')}
                  onPress={resetFilters}
                  hitSlop={8}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={14} color={mutedColor} />
                </Pressable>
              ) : null}
            </View>
          )
        ) : null}

        {!txsLoaded ? null : grouped.length === 0 ? (
          txs.length === 0 ? (
            /* Truly empty — friendlier welcome card with NLP example.
               Gated on txsLoaded so it doesn't flash before the first
               Firestore emission lands on cold open. */
            <Card padding="lg" className="items-center mt-2">
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: tokens.accent.dashboard + '22',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
              >
                <Plus size={24} color={tokens.accent.dashboard} strokeWidth={2.4} />
              </View>
              <Text className="font-sans-bold text-lg text-center" style={{ color: fgColor }}>
                {t('transactions:welcome.title')}
              </Text>
              <Text
                className="font-sans text-sm text-center mt-2 mb-4"
                style={{ color: mutedColor, lineHeight: 20 }}
              >
                {t('transactions:welcome.body')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('transactions:welcome.cta')}
                onPress={() =>
                  router.replace({
                    pathname: '/transaction/new',
                    params: { from: '/transactions' },
                  })
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: tokens.accent.dashboard,
                  minHeight: 44,
                }}
              >
                <Plus size={14} color="#fff" />
                <Text className="font-sans-medium text-white text-sm">
                  {t('transactions:welcome.cta')}
                </Text>
              </Pressable>
            </Card>
          ) : (
            // Filtered view returned no rows. Offer a quick reset CTA
            // — without it the user has to scroll back up + find the
            // small X on the filter pill row, which defeats glanceable
            // recovery from an over-narrow filter combo.
            <Card padding="lg" className="items-center">
              <Text className="font-sans text-sm text-center mb-4" style={{ color: mutedColor }}>
                {t('transactions:filters.noResults')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('transactions:filters.clear')}
                onPress={resetFilters}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor,
                  minHeight: 38,
                }}
              >
                <X size={14} color={fgColor} />
                <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                  {t('transactions:filters.clear')}
                </Text>
              </Pressable>
            </Card>
          )
        ) : (
          grouped.map(([date, items]) => (
            <View key={date} className="mb-4">
              <Text
                className="font-sans-medium text-xs uppercase tracking-wider mb-2 px-4"
                style={{ color: mutedColor }}
              >
                {formatDate(new Date(date), 'long', lang)}
              </Text>
              <Card padding="none">
                {items.map((tx, idx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    accountsById={accountsById}
                    categoriesById={categoriesById}
                    isDark={isDark}
                    lang={lang}
                    fgColor={fgColor}
                    mutedColor={mutedColor}
                    displayInIDR={displayInIDR}
                    showDivider={idx > 0}
                    onPress={() => router.push(`/transaction/${tx.id}` as Href)}
                    t={t}
                  />
                ))}
              </Card>
            </View>
          ))
        )}
      </View>
      {/* Mobile filters bottom-sheet. Modal slides up; backdrop dismisses;
          contains every dimension as a stacked section so the user
          edits all filters in one place rather than tap-pill-tap-pill. */}
      <Modal
        visible={filtersSheetOpen && !isDesktop}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersSheetOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'flex-end',
          }}
          onPress={() => setFiltersSheetOpen(false)}
        >
          <Animated.View
            // Stop propagation so taps inside the sheet don't dismiss.
            onStartShouldSetResponder={() => true}
            onResponderRelease={(e: GestureResponderEvent) => e.stopPropagation()}
            style={{
              backgroundColor: isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'],
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
              paddingBottom: Math.max(8, insets.bottom),
              maxHeight: '85%',
              transform: [{ translateY: sheetTranslateY }],
            }}
          >
            {/* Drag-target zone — wraps the sheet handle in a tall
                tappable region so the swipe gesture has a generous
                hit area. PanResponder lives here, not on the whole
                sheet, so the inner ScrollView keeps its own scroll
                behaviour intact. Tapping the handle/zone also closes
                the sheet (fallback for users who don't realise they
                can drag). */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.close')}
              onPress={() => setFiltersSheetOpen(false)}
              style={{ paddingVertical: 10, alignItems: 'center' }}
              {...sheetPanResponder.panHandlers}
            >
              <View
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: borderColor,
                }}
              />
            </Pressable>
            {/* Sheet header */}
            <View className="flex-row items-center justify-between px-5 mb-3">
              <Text className="font-sans-bold text-lg" style={{ color: fgColor }}>
                {t('transactions:filters.sheetTitle')}
              </Text>
              <View className="flex-row items-center" style={{ gap: 12 }}>
                {filtersDirty ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('transactions:filters.clear')}
                    onPress={resetFilters}
                  >
                    <Text className="font-sans-medium text-sm" style={{ color: tokens.accent.dashboard }}>
                      {t('transactions:filters.clear')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common:actions.close')}
                  onPress={() => setFiltersSheetOpen(false)}
                  hitSlop={8}
                >
                  <X size={20} color={fgColor} />
                </Pressable>
              </View>
            </View>
            {/* Sheet body — stacked filter sections, all expanded. */}
            <ScrollView
              style={{ paddingHorizontal: 20 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Sectionised panels — bordered={false} since each
                  section already has an uppercase label + spacing
                  giving visual separation; an extra inner border was
                  redundant chrome. */}
              {/* Type */}
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2 mt-2" style={{ color: mutedColor }}>
                {t('transactions:entry.fields.type')}
              </Text>
              <FilterOptionPanel
                options={typeChips}
                selectedKey={typeFilter}
                onSelect={(key) => setTypeFilter(key)}
                isDark={isDark}
                bordered={false}
              />
              {/* Date */}
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2 mt-4" style={{ color: mutedColor }}>
                {t('transactions:entry.fields.date')}
              </Text>
              <DateFilterSection
                dateChips={dateChips}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                customFrom={customFrom}
                customTo={customTo}
                setCustomFrom={setCustomFrom}
                setCustomTo={setCustomTo}
                isDark={isDark}
                lang={lang}
                t={t}
                bordered={false}
              />
              {/* Tags */}
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2 mt-4" style={{ color: mutedColor }}>
                {t('transactions:filters.tagsLabel')}
              </Text>
              <TagFilterPanel
                tagFrequencies={tagFrequencies}
                selectedTags={tagFilter}
                onToggle={(tag) => {
                  setTagFilter((cur) => (cur.includes(tag)
                    ? cur.filter((x) => x !== tag)
                    : [...cur, tag]));
                }}
                isDark={isDark}
                t={t}
                bordered={false}
              />
              {/* Category */}
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2 mt-4" style={{ color: mutedColor }}>
                {t('transactions:filters.categoryLabel')}
              </Text>
              <CategoryFilterPanel
                categories={categories}
                selectedCategoryIds={categoryFilter}
                onToggle={(catId) => {
                  setCategoryFilter((cur) => (cur.includes(catId)
                    ? cur.filter((c) => c !== catId)
                    : [...cur, catId]));
                }}
                isDark={isDark}
                lang={lang}
                t={t}
                bordered={false}
              />
              {/* Account */}
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-2 mt-4" style={{ color: mutedColor }}>
                {t('transactions:filters.accountLabel')}
              </Text>
              <AccountFilterPanel
                accounts={accounts}
                selectedAccountIds={accountFilter}
                onToggle={(accId) => {
                  setAccountFilter((cur) => (cur.includes(accId)
                    ? cur.filter((a) => a !== accId)
                    : [...cur, accId]));
                }}
                isDark={isDark}
                t={t}
                bordered={false}
              />
              {/* Done CTA */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.done')}
                onPress={() => setFiltersSheetOpen(false)}
                style={{
                  marginTop: 16,
                  paddingVertical: 11,
                  borderRadius: 10,
                  backgroundColor: tokens.accent.dashboard,
                  alignItems: 'center',
                  minHeight: 44,
                }}
              >
                <Text className="font-sans-medium text-white text-sm">
                  {t('common:actions.done')}
                </Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ---------- DateFilterSection ----------

type DateFilterSectionProps = {
  dateChips: { key: DateFilter; label: string }[];
  dateFilter: DateFilter;
  setDateFilter: (key: DateFilter) => void;
  customFrom: string | null;
  customTo: string | null;
  setCustomFrom: (v: string | null) => void;
  setCustomTo: (v: string | null) => void;
  isDark: boolean;
  lang: Locale;
  t: TFunction;
  bordered?: boolean;
};

/**
 * Date filter chip grid + optional custom range pickers (v3 phase A —
 * 7). Used by both the desktop expand-panel and the mobile bottom
 * sheet. When dateFilter === 'custom', two DateField rows expand
 * inline below the chips letting the user pick From + To.
 *
 * The 'custom' chip never auto-collapses the picker — once selected
 * the user almost always wants to edit the range. Picking a different
 * preset chip clears the custom values implicitly (irrelevant under
 * the new preset).
 */
function DateFilterSection({
  dateChips, dateFilter, setDateFilter, customFrom, customTo,
  setCustomFrom, setCustomTo, isDark, lang, t, bordered = true,
}: DateFilterSectionProps) {
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];

  return (
    <View>
      <FilterOptionPanel
        options={dateChips}
        selectedKey={dateFilter}
        onSelect={(key) => {
          setDateFilter(key);
          // Clear custom values when switching back to a preset, so a
          // re-select of 'custom' starts fresh rather than retaining
          // whatever stale range was set last time.
          if (key !== 'custom') {
            setCustomFrom(null);
            setCustomTo(null);
          }
        }}
        isDark={isDark}
        bordered={bordered}
      />
      {dateFilter === 'custom' ? (
        <View style={{ gap: 10, marginTop: 4, marginBottom: 12 }}>
          <View>
            <Text className="font-sans-medium text-xs mb-1.5" style={{ color: mutedColor }}>
              {t('transactions:filters.customFrom')}
            </Text>
            <DateField
              value={customFrom ?? ''}
              onChange={(v) => setCustomFrom(v || null)}
              placeholder={t('transactions:filters.customFromPlaceholder')}
              lang={lang}
              accessibilityLabel={t('transactions:filters.customFrom')}
              {...(customTo ? { maxDate: customTo } : {})}
            />
          </View>
          <View>
            <Text className="font-sans-medium text-xs mb-1.5" style={{ color: mutedColor }}>
              {t('transactions:filters.customTo')}
            </Text>
            <DateField
              value={customTo ?? ''}
              onChange={(v) => setCustomTo(v || null)}
              placeholder={t('transactions:filters.customToPlaceholder')}
              lang={lang}
              accessibilityLabel={t('transactions:filters.customTo')}
              {...(customFrom ? { minDate: customFrom } : {})}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

type FilterPillProps = {
  label: string;            // dimension name (e.g. "Type") — shown at default state
  value: string;            // current selection (e.g. "Expense") — shown when active
  isActive: boolean;        // true when filter diverges from default
  open: boolean;
  onPress: () => void;
  isDark: boolean;
};

/**
 * Compact filter pill (mobile-density redesign).
 *
 * Default state: shows ONLY the dimension name (e.g. "Type"). Filter
 * is at default ("All", "This month", etc.) so we don't need to spell
 * it out — it's the implicit baseline.
 *
 * Active state: shows the selected value with accent-tinted bg + bold
 * text, so the user can scan the pill row and see at a glance which
 * dimensions are filtering. Mobile-density: smaller paddings + 30px
 * minHeight (was 36px).
 */
function FilterPill({ label, value, isActive, open, onPress, isDark }: FilterPillProps) {
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const accent = tokens.accent.dashboard;

  // What text the pill shows: dimension name when at default, value
  // when filtering. Keeps the row scannable.
  const displayText = isActive ? value : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: open || isActive ? accent : borderColor,
        backgroundColor: open || isActive ? accent + '14' : 'transparent',
        minHeight: 30,
        gap: 4,
      }}
    >
      <Text
        className="font-sans-medium text-xs"
        style={{ color: open || isActive ? accent : mutedColor }}
      >
        {displayText}
      </Text>
      <ChevronDown
        size={12}
        color={open || isActive ? accent : mutedColor}
        style={{
          transform: [{ rotate: open ? '180deg' : '0deg' }],
        }}
      />
    </Pressable>
  );
}

type FilterOptionPanelProps<K extends string> = {
  options: { key: K; label: string }[];
  selectedKey: K;
  onSelect: (key: K) => void;
  isDark: boolean;
  /** Wrap chips in a bordered card (desktop default) vs no chrome
   *  (mobile sheet — sectionised already has labels + spacing). */
  bordered?: boolean;
};

function FilterOptionPanel<K extends string>({
  options,
  selectedKey,
  onSelect,
  isDark,
  bordered = true,
}: FilterOptionPanelProps<K>) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        padding: bordered ? 8 : 0,
        borderRadius: bordered ? 12 : 0,
        borderWidth: bordered ? 1 : 0,
        borderColor: bordered ? borderColor : 'transparent',
        marginBottom: bordered ? 12 : 0,
      }}
    >
      {options.map((opt) => {
        const selected = opt.key === selectedKey;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(opt.key)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: selected ? tokens.accent.dashboard : borderColor,
              backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
            }}
          >
            <Text
              className="font-sans-medium text-xs"
              style={{ color: selected ? tokens.accent.dashboard : fgColor }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type TagFilterPanelProps = {
  tagFrequencies: Map<string, number>;
  selectedTags: string[];
  onToggle: (tag: string) => void;
  isDark: boolean;
  t: TFunction;
  bordered?: boolean;
};

/**
 * Multi-select tag picker (ADR-17). Renders the tag list ordered by
 * usage frequency (most-used first), with a small `· N` count next to
 * each tag so the user can see what's worth picking. Selected tags get
 * the accent treatment; tap toggles. Empty state when no tags exist
 * yet — explicit hint that they need to add tags before this filter
 * does anything.
 */
function TagFilterPanel({ tagFrequencies, selectedTags, onToggle, isDark, t, bordered = true }: TagFilterPanelProps) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const tagList = [...tagFrequencies.entries()];
  return (
    <View
      style={{
        padding: bordered ? 8 : 0,
        borderRadius: bordered ? 12 : 0,
        borderWidth: bordered ? 1 : 0,
        borderColor: bordered ? borderColor : 'transparent',
        marginBottom: bordered ? 12 : 0,
      }}
    >
      {tagList.length === 0 ? (
        <Text className="font-sans text-xs" style={{ color: mutedColor, padding: 8 }}>
          {t('transactions:filters.tagsPickerEmpty')}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {tagList.map(([tag, count]) => {
            const selected = selectedTags.includes(tag);
            return (
              <Pressable
                key={tag}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onToggle(tag)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: selected ? tokens.accent.dashboard : borderColor,
                  backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                }}
              >
                <Text
                  className="font-sans-medium text-xs"
                  style={{ color: selected ? tokens.accent.dashboard : fgColor }}
                >
                  {tag}
                </Text>
                <Text className="font-sans text-xs" style={{ color: mutedColor }}>
                  · {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ---------- v3 phase A — 5: Category + Account filter panels ----------

type CategoryFilterPanelProps = {
  categories: Category[];
  selectedCategoryIds: string[];
  onToggle: (id: string) => void;
  isDark: boolean;
  lang: Locale;
  t: TFunction;
  bordered?: boolean;
};

/**
 * Multi-select category picker — mirrors TagFilterPanel layout. Uses
 * the curated category color tinting from /budgets so the chips read as
 * "the same Cafe you see everywhere in the app". Sorted by parent
 * category for groupable scanning; archived categories hidden.
 */
function CategoryFilterPanel({
  categories, selectedCategoryIds, onToggle, isDark, lang, t, bordered = true,
}: CategoryFilterPanelProps) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const visible = categories.filter((c) => !c.isArchived);
  return (
    <View
      style={{
        padding: bordered ? 8 : 0,
        borderRadius: bordered ? 12 : 0,
        borderWidth: bordered ? 1 : 0,
        borderColor: bordered ? borderColor : 'transparent',
        marginBottom: bordered ? 12 : 0,
      }}
    >
      {visible.length === 0 ? (
        <Text className="font-sans text-xs" style={{ color: mutedColor, padding: 8 }}>
          {t('transactions:filters.categoryPickerEmpty')}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {visible.map((cat) => {
            const selected = selectedCategoryIds.includes(cat.id);
            const tint = resolveCategoryColor(cat.color, isDark ? 'dark' : 'light');
            return (
              <Pressable
                key={cat.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onToggle(cat.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: selected ? tint : borderColor,
                  backgroundColor: selected ? tint + '14' : 'transparent',
                }}
              >
                <CategoryIcon name={cat.icon} color={tint} size={12} />
                <Text
                  className="font-sans-medium text-xs"
                  style={{ color: selected ? tint : fgColor }}
                >
                  {cat.name[lang]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

type AccountFilterPanelProps = {
  accounts: Account[];
  selectedAccountIds: string[];
  onToggle: (id: string) => void;
  isDark: boolean;
  t: TFunction;
  bordered?: boolean;
};

/**
 * Multi-select account picker. Same chip-grid layout as the tag and
 * category panels. Archived accounts hidden. Each chip shows the
 * account's name; selecting tints with the account's stored colour
 * so it reads identically to the row in /accounts.
 */
function AccountFilterPanel({
  accounts, selectedAccountIds, onToggle, isDark, t, bordered = true,
}: AccountFilterPanelProps) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const visible = accounts.filter((a) => !a.isArchived);
  return (
    <View
      style={{
        padding: bordered ? 8 : 0,
        borderRadius: bordered ? 12 : 0,
        borderWidth: bordered ? 1 : 0,
        borderColor: bordered ? borderColor : 'transparent',
        marginBottom: bordered ? 12 : 0,
      }}
    >
      {visible.length === 0 ? (
        <Text className="font-sans text-xs" style={{ color: mutedColor, padding: 8 }}>
          {t('transactions:filters.accountPickerEmpty')}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {visible.map((acct) => {
            const selected = selectedAccountIds.includes(acct.id);
            const tint = resolveCategoryColor(acct.color, isDark ? 'dark' : 'light');
            return (
              <Pressable
                key={acct.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onToggle(acct.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: selected ? tint : borderColor,
                  backgroundColor: selected ? tint + '14' : 'transparent',
                }}
              >
                <CategoryIcon name={acct.icon} color={tint} size={12} />
                <Text
                  className="font-sans-medium text-xs"
                  style={{ color: selected ? tint : fgColor }}
                >
                  {acct.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

type TransactionRowProps = {
  tx: Transaction;
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
  isDark: boolean;
  lang: Locale;
  fgColor: string;
  mutedColor: string;
  displayInIDR: boolean;
  showDivider: boolean;
  onPress: () => void;
  t: TFunction;
};

function TransactionRow({
  tx, accountsById, categoriesById, isDark, lang, fgColor, mutedColor, displayInIDR, showDivider, onPress, t,
}: TransactionRowProps) {
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const account = accountsById.get(tx.accountId);
  const toAccount = tx.toAccountId ? accountsById.get(tx.toAccountId) : null;
  const splitCategory = tx.splits[0]?.categoryId ? categoriesById.get(tx.splits[0].categoryId) : null;

  let icon = splitCategory?.icon ?? account?.icon ?? 'tag';
  let tint = splitCategory?.color ?? account?.color ?? 'slate';
  if (tx.type === 'transfer' && account) {
    icon = account.icon;
    tint = account.color;
  }
  const swatch = resolveCategoryColor(tint, isDark ? 'dark' : 'light');

  const primary = tx.description?.trim()
    || splitCategory?.name[lang]
    || t(`transactions:entry.types.${tx.type}`);

  const accountLabel = account?.name ?? '?';
  const secondary = tx.type === 'transfer' && toAccount
    ? `${accountLabel} → ${toAccount.name}`
    : accountLabel;

  let amountColor = fgColor;
  let amountPrefix = '';
  if (tx.type === 'expense') {
    amountColor = tokens.semantic.danger;
    amountPrefix = '−';
  } else if (tx.type === 'income') {
    amountColor = tokens.semantic.positive;
    amountPrefix = '+';
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={primary}
      onPress={onPress}
      className="flex-row items-center px-4 py-3 min-h-[44px]"
      style={{
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: borderColor,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          backgroundColor: swatch + '22',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <CategoryIcon name={icon} color={swatch} size={18} />
      </View>
      <View className="flex-1">
        <Text className="font-sans-medium" style={{ color: fgColor }} numberOfLines={1}>
          {primary}
        </Text>
        <Text className="font-sans text-xs" style={{ color: mutedColor }} numberOfLines={1}>
          {secondary}
        </Text>
        {/* Tag chips (ADR-17). Cap visible to 3 per row + overflow
            "+N"; full list available on tap-to-edit. */}
        {Array.isArray(tx.tags) && tx.tags.length > 0 ? (
          <View className="flex-row flex-wrap mt-1" style={{ gap: 4 }}>
            {tx.tags.slice(0, 3).map((tag) => (
              <View
                key={tag}
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor,
                }}
              >
                <Text
                  className="font-sans"
                  style={{ color: mutedColor, fontSize: 10, letterSpacing: 0.3 }}
                >
                  {tag}
                </Text>
              </View>
            ))}
            {tx.tags.length > 3 ? (
              <Text className="font-sans" style={{ color: mutedColor, fontSize: 10 }}>
                +{tx.tags.length - 3}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {(() => {
          const display = formatAmountForDisplay(
            tx.amount, tx.currency ?? 'IDR', displayInIDR, lang,
          );
          return (
            <>
              <Text
                className="font-mono tabular-nums text-base font-sans-semibold"
                style={{ color: amountColor }}
              >
                {amountPrefix}
                {display.primary}
              </Text>
              {display.secondary ? (
                <Text
                  className="font-mono tabular-nums text-xs"
                  style={{ color: mutedColor, marginTop: 2 }}
                >
                  {display.secondary}
                </Text>
              ) : null}
            </>
          );
        })()}
      </View>
    </Pressable>
  );
}
