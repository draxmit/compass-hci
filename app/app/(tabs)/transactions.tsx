import type {
  Account, Category, SavedFilter, Transaction, TransactionType,
} from '@compass/shared-types';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import { Bookmark, BookmarkPlus, ChevronDown, Plus, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';

import { subscribeAccounts } from '@/services/firestore/accountsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import {
  createSavedFilter, deleteSavedFilter, subscribeSavedFilters,
} from '@/services/firestore/savedFiltersService';
import { subscribeRecent } from '@/services/firestore/transactionsService';
import { useAuthUser, useUserDoc } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { useAppAlert } from '@/shared/ui/AppAlert';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import { formatDate } from '@/shared/utils/formatDate';
import { formatAmountForDisplay } from '@/shared/utils/formatAmountForDisplay';
import { collectTagFrequencies } from '@/shared/utils/tags';

type TypeFilter = 'all' | TransactionType;
type DateFilter = 'this_month' | 'last_month' | 'all_time';

/**
 * (tabs)/transactions.tsx — recent transactions list with chip filters
 * + tap-to-edit. Subscribes to the most recent 50 transactions across all
 * months; filters run client-side.
 *
 * v1 simplification: the 50-tx subscription cap means "All time" filter
 * actually shows the last 50 (ADR-08 §3). When a real user has hundreds
 * of transactions a future polish pass should switch to a yearMonth-driven
 * subscription with paged "load older" affordance.
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
  // Which filter pill (if any) is currently expanded. Only one open at a
  // time — Mercury/Linear-style dropdown chip pattern.
  const [openFilter, setOpenFilter] = useState<'type' | 'date' | 'tags' | null>(null);

  useEffect(() => {
    if (!wid) return;
    const unsubT = subscribeRecent(wid, 50, (data) => {
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
    const lower = search.trim().toLowerCase();

    return txs.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (dateFilter === 'this_month' && tx.yearMonth !== thisYearMonth) return false;
      if (dateFilter === 'last_month' && tx.yearMonth !== lastYearMonth) return false;
      if (lower && !tx.description.toLowerCase().includes(lower)) return false;
      if (tagFilter.length > 0) {
        const txTags = tx.tags ?? [];
        const anyMatch = tagFilter.some((t) => txTags.includes(t));
        if (!anyMatch) return false;
      }
      return true;
    });
  }, [txs, typeFilter, dateFilter, search, tagFilter]);

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
    const matches =
      preset.search === search
      && preset.typeFilter === typeFilter
      && preset.dateFilter === dateFilter
      && preset.tagFilter.length === tagFilter.length
      && preset.tagFilter.every((t) => tagFilter.includes(t));
    if (!matches) setActivePresetId(null);
  }, [activePresetId, savedFilters, search, typeFilter, dateFilter, tagFilter]);

  const applyPreset = (preset: SavedFilter) => {
    setSearch(preset.search);
    setTypeFilter(preset.typeFilter);
    setDateFilter(preset.dateFilter);
    setTagFilter(preset.tagFilter);
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
        tagFilter,
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
    search.trim() !== '' || typeFilter !== 'all' || dateFilter !== 'this_month' || tagFilter.length > 0;

  const typeChips: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: t('transactions:filters.allTypes') },
    { key: 'expense', label: t('transactions:entry.types.expense') },
    { key: 'income', label: t('transactions:entry.types.income') },
    { key: 'transfer', label: t('transactions:entry.types.transfer') },
  ];

  const dateChips: { key: DateFilter; label: string }[] = [
    { key: 'this_month', label: t('transactions:filters.thisMonth') },
    { key: 'last_month', label: t('transactions:filters.lastMonth') },
    { key: 'all_time', label: t('transactions:filters.allTime') },
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

        {/* Filter pills — two compact dropdowns + optional Clear link.
            Tapping a pill expands its options below; only one expanded
            at a time. Hidden when there are no transactions to filter. */}
        {txs.length > 0 ? (
        <>
        <View className="flex-row flex-wrap items-center mb-2" style={{ gap: 8 }}>
          <FilterPill
            label={t('transactions:entry.fields.type')}
            value={typeChips.find((c) => c.key === typeFilter)?.label ?? ''}
            open={openFilter === 'type'}
            onPress={() => setOpenFilter((cur) => (cur === 'type' ? null : 'type'))}
            isDark={isDark}
          />
          <FilterPill
            label={t('transactions:entry.fields.date')}
            value={dateChips.find((c) => c.key === dateFilter)?.label ?? ''}
            open={openFilter === 'date'}
            onPress={() => setOpenFilter((cur) => (cur === 'date' ? null : 'date'))}
            isDark={isDark}
          />
          <FilterPill
            label={t('transactions:filters.tagsLabel')}
            value={tagFilter.length === 0
              ? t('transactions:filters.tagsAll')
              : t('transactions:filters.tagsCount', { count: tagFilter.length, context: tagFilter.length === 1 ? 'one' : 'other' })}
            open={openFilter === 'tags'}
            onPress={() => setOpenFilter((cur) => (cur === 'tags' ? null : 'tags'))}
            isDark={isDark}
          />
          {filtersDirty ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('transactions:filters.clear')}
              onPress={() => {
                setSearch('');
                setTypeFilter('all');
                setDateFilter('this_month');
                setTagFilter([]);
                setOpenFilter(null);
              }}
              hitSlop={6}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 1,
                borderColor,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 'auto',
              }}
            >
              <X size={14} color={mutedColor} />
            </Pressable>
          ) : null}
        </View>

        {/* Expanded options for the open pill. */}
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
          <FilterOptionPanel
            options={dateChips}
            selectedKey={dateFilter}
            onSelect={(key) => {
              setDateFilter(key);
              setOpenFilter(null);
            }}
            isDark={isDark}
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

        <View className="mb-3" />
        </>
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
            <Card padding="lg">
              <Text className="font-sans text-sm text-center" style={{ color: mutedColor }}>
                {t('transactions:filters.noResults')}
              </Text>
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
    </ScrollView>
  );
}

type FilterPillProps = {
  label: string;            // dimension name (e.g. "Type")
  value: string;            // current selection (e.g. "All")
  open: boolean;
  onPress: () => void;
  isDark: boolean;
};

function FilterPill({ label, value, open, onPress, isDark }: FilterPillProps) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: open ? tokens.accent.dashboard : borderColor,
        backgroundColor: open ? tokens.accent.dashboard + '14' : 'transparent',
        minHeight: 36,
        gap: 4,
      }}
    >
      <Text className="font-sans text-xs" style={{ color: mutedColor }}>
        {label}:
      </Text>
      <Text className="font-sans-medium text-xs" style={{ color: fgColor }}>
        {value}
      </Text>
      <ChevronDown
        size={14}
        color={open ? tokens.accent.dashboard : mutedColor}
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
};

function FilterOptionPanel<K extends string>({
  options,
  selectedKey,
  onSelect,
  isDark,
}: FilterOptionPanelProps<K>) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        marginBottom: 12,
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
};

/**
 * Multi-select tag picker (ADR-17). Renders the tag list ordered by
 * usage frequency (most-used first), with a small `· N` count next to
 * each tag so the user can see what's worth picking. Selected tags get
 * the accent treatment; tap toggles. Empty state when no tags exist
 * yet — explicit hint that they need to add tags before this filter
 * does anything.
 */
function TagFilterPanel({ tagFrequencies, selectedTags, onToggle, isDark, t }: TagFilterPanelProps) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];
  const tagList = [...tagFrequencies.entries()];
  return (
    <View
      style={{
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor,
        marginBottom: 12,
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
