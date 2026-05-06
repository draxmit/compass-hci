import type { Account, Category, TransactionType } from '@compass/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Alert, BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { subscribeAccounts } from '@/services/firestore/accountsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import { createTransaction } from '@/services/firestore/transactionsService';
import { useAuthUser } from '@/stores/authStore';
import type { Locale } from '@/shared/i18n';
import { resolveCategoryColor } from '@/shared/theme/categoryColors';
import { tokens } from '@/shared/theme/tokens';
import { useTheme } from '@/shared/theme/useTheme';
import { Card } from '@/shared/ui/Card';
import { CategoryIcon } from '@/shared/ui/CategoryIcon';
import { Text } from '@/shared/ui/Text';
import { TextField } from '@/shared/ui/TextField';
import {
  formatAmountInput, minorToInputText, parseAmountInput,
} from '@/shared/utils/amountInput';
import { formatIDR } from '@/shared/utils/formatIDR';
import { parseTransaction } from '@/shared/utils/nlpParser';
import type { NlpResult } from '@/shared/utils/nlpParser';

const TYPES: readonly TransactionType[] = ['expense', 'income', 'transfer'];

/**
 * /transaction/new — quick-entry screen reached from the FAB on tabs and
 * the "+ New transaction" CTA in the sidebar. Single screen that combines
 * an NLP free-text input + a manual form. The parser fires on the NLP
 * input and pre-populates the form fields; user reviews + edits + saves.
 *
 * Atomic batch write goes through transactionsService.createTransaction —
 * tx doc + balance delta + category month total all land together.
 */
// Tab paths the FAB / welcome cards may pass via ?from=… so we know
// where to return to on save / cancel / hardware-back. Anything else
// is dropped — we never let an arbitrary path through, which would let
// a malformed link punt the user to a non-tab screen on close.
const VALID_FROM = ['/', '/transactions', '/budgets', '/insights'] as const;
type ValidFrom = (typeof VALID_FROM)[number];
function resolveFrom(raw: unknown): ValidFrom {
  return typeof raw === 'string' && (VALID_FROM as readonly string[]).includes(raw)
    ? (raw as ValidFrom)
    : '/transactions';
}

export default function NewTransactionScreen() {
  const { t, i18n } = useTranslation(['transactions', 'accounts', 'categories', 'common']);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const wid = user ? `solo-${user.uid}` : null;
  // Source tab passed by the FAB / welcome cards via ?from=. Used as the
  // close-fallback target when there's no Stack frame to pop (we arrived
  // via router.replace, not push). Falls back to /transactions if absent
  // or invalid.
  const params = useLocalSearchParams<{ from?: string }>();
  const fromTab: Href = resolveFrom(params.from);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Form state — populated by NLP, overrideable by user.
  const [type, setType] = useState<TransactionType>('expense');
  const [amountText, setAmountText] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [date] = useState(new Date().toISOString().slice(0, 10));  // T6 v1 = today only; T7 will add date picker
  const [nlpInput, setNlpInput] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [saving, setSaving] = useState(false);

  // Per-field "touched-by-user" flags so re-parsing on every keystroke
  // doesn't clobber fields the user has manually edited.
  const touched = useRef<{ type: boolean; amount: boolean; account: boolean; toAccount: boolean; category: boolean; description: boolean }>({
    type: false, amount: false, account: false, toAccount: false, category: false, description: false,
  });

  useEffect(() => {
    if (!wid) return;
    const unsubA = subscribeAccounts(wid, setAccounts);
    const unsubC = subscribeCategories(wid, setCategories);
    return () => { unsubA(); unsubC(); };
  }, [wid]);

  // Hardware back: same fallback as Profile — we may have arrived here via
  // router.replace from the FAB (mobile), in which case the Stack is empty
  // behind us and Android's default back would exit the app. Route to the
  // source tab passed via ?from= (or /transactions as the safe fallback).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false;
      router.replace(fromTab);
      return true;
    });
    return () => sub.remove();
  }, [router, fromTab]);

  const closeScreen = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fromTab);
  };

  // Re-parse on every NLP-input change. Apply-result inlined so the
  // useEffect closure can be stable without an extra useCallback.
  useEffect(() => {
    if (!nlpInput.trim()) {
      setConfidence(0);
      return;
    }
    const r: NlpResult = parseTransaction(nlpInput, { categories, accounts, today: date });
    setConfidence(r.confidence);
    if (!touched.current.type) setType(r.type);
    if (!touched.current.amount && r.amount !== null) {
      setAmountText(minorToInputText(r.amount, lang));
    }
    if (!touched.current.account && r.accountId) setAccountId(r.accountId);
    if (!touched.current.toAccount && r.toAccountId) setToAccountId(r.toAccountId);
    if (!touched.current.category && r.categoryId) setCategoryId(r.categoryId);
    if (!touched.current.description && r.description) setDescription(r.description);
  }, [nlpInput, accounts, categories, date, lang]);

  const handleSave = async () => {
    if (saving || !wid) return;
    const amount = parseAmountInput(amountText, lang);
    if (!amount) {
      Alert.alert(t('transactions:entry.title'), t('transactions:entry.errors.missingAmount'));
      return;
    }
    if (!accountId) {
      Alert.alert(t('transactions:entry.title'), t('transactions:entry.errors.missingAccount'));
      return;
    }
    if (type !== 'transfer' && !categoryId) {
      Alert.alert(t('transactions:entry.title'), t('transactions:entry.errors.missingCategory'));
      return;
    }
    if (type === 'transfer' && !toAccountId) {
      Alert.alert(t('transactions:entry.title'), t('transactions:entry.errors.missingToAccount'));
      return;
    }
    if (type === 'transfer' && accountId === toAccountId) {
      Alert.alert(t('transactions:entry.title'), t('transactions:entry.errors.sameAccount'));
      return;
    }

    setSaving(true);
    try {
      await createTransaction(wid, {
        type,
        date,
        accountId,
        toAccountId: type === 'transfer' ? toAccountId : null,
        amount,
        splits: type === 'transfer' || !categoryId ? [] : [{ categoryId, amount }],
        description: description.trim() || (nlpInput.trim() || ''),
        source: nlpInput.trim() ? 'nlp' : 'manual',
        rawInput: nlpInput.trim() || null,
        confidence: nlpInput.trim() ? confidence : null,
      });
      closeScreen();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('transactions:entry.errors.createFailed');
      Alert.alert(t('transactions:entry.title'), msg);
    } finally {
      setSaving(false);
    }
  };

  const accountOptions = useMemo(() => accounts, [accounts]);

  return (
    <View style={{ flex: 1, backgroundColor: overlayBg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          paddingTop: 48,
          paddingBottom: 24 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="self-center w-full max-w-md">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('common:actions.back')}
            onPress={closeScreen}
            hitSlop={8}
            className="flex-row items-center mb-4 -ml-2 px-2 py-2 min-h-[44px] self-start"
          >
            <ChevronLeft size={22} color={fgColor} />
            <Text className="font-sans-medium ml-1" style={{ color: fgColor }}>
              {t('common:actions.back')}
            </Text>
          </Pressable>

          <Text className="font-sans-bold text-3xl mb-4">{t('transactions:entry.title')}</Text>

          {/* NLP quick-entry */}
          <Card padding="lg" className="mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="font-sans-medium text-xs uppercase tracking-wider" style={{ color: mutedColor }}>
                {t('transactions:entry.nlpLabel')}
              </Text>
              {confidence > 0 ? (
                <Text className="font-sans text-xs" style={{ color: mutedColor }}>
                  {t('transactions:entry.confidence', { percent: Math.round(confidence * 100) })}
                </Text>
              ) : null}
            </View>
            <TextField
              label=""
              value={nlpInput}
              onChangeText={setNlpInput}
              placeholder={t('transactions:entry.nlpPlaceholder')}
              autoCapitalize="none"
              returnKeyType="done"
            />
            <Text className="font-sans text-xs mt-2" style={{ color: mutedColor }}>
              {t('transactions:entry.nlpHint')}
            </Text>
          </Card>

          {/* Type segmented buttons */}
          <Card padding="lg" className="mb-4">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('transactions:entry.fields.type')}
            </Text>
            <View className="flex-row" style={{ gap: 6 }}>
              {TYPES.map((typeKey) => {
                const selected = type === typeKey;
                return (
                  <Pressable
                    key={typeKey}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => { touched.current.type = true; setType(typeKey); }}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 44,
                      borderColor: selected ? tokens.accent.dashboard : borderColor,
                      backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                    }}
                  >
                    <Text
                      className="font-sans-medium text-sm"
                      style={{ color: selected ? tokens.accent.dashboard : fgColor }}
                    >
                      {t(`transactions:entry.types.${typeKey}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Amount */}
          <Card padding="lg" className="mb-4">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('transactions:entry.fields.amount')}
            </Text>
            <TextField
              label=""
              value={amountText}
              onChangeText={(v) => { touched.current.amount = true; setAmountText(formatAmountInput(v, lang)); }}
              placeholder={t('transactions:entry.fields.amountPlaceholder')}
              keyboardType="numeric"
              returnKeyType="done"
            />
            {amountText ? (
              <Text className="font-mono tabular-nums text-xs mt-2" style={{ color: mutedColor }}>
                {formatIDR(parseAmountInput(amountText, lang))}
              </Text>
            ) : null}
          </Card>

          {/* From account / single account */}
          <AccountPicker
            label={t(type === 'transfer' ? 'transactions:entry.fields.fromAccount' : 'transactions:entry.fields.account')}
            accounts={accountOptions}
            selectedId={accountId}
            onSelect={(id) => { touched.current.account = true; setAccountId(id); }}
            isDark={isDark}
            t={t}
          />

          {/* To account (transfer only) */}
          {type === 'transfer' ? (
            <AccountPicker
              label={t('transactions:entry.fields.toAccount')}
              accounts={accountOptions}
              selectedId={toAccountId}
              onSelect={(id) => { touched.current.toAccount = true; setToAccountId(id); }}
              isDark={isDark}
              t={t}
            />
          ) : null}

          {/* Category (expense / income only) */}
          {type !== 'transfer' ? (
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              onSelect={(id) => { touched.current.category = true; setCategoryId(id); }}
              isDark={isDark}
              lang={lang}
              t={t}
            />
          ) : null}

          {/* Description */}
          <Card padding="lg" className="mb-4">
            <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
              {t('transactions:entry.fields.description')}
            </Text>
            <TextField
              label=""
              value={description}
              onChangeText={(v) => { touched.current.description = true; setDescription(v); }}
              placeholder={t('transactions:entry.fields.descriptionPlaceholder')}
              autoCapitalize="sentences"
              returnKeyType="done"
            />
          </Card>

          {/* Save / Cancel */}
          <View className="flex-row gap-2 mt-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('transactions:entry.actions.cancel')}
              onPress={closeScreen}
              disabled={saving}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor,
                minHeight: 44,
                opacity: saving ? 0.5 : 1,
              }}
            >
              <Text className="font-sans-medium text-sm" style={{ color: fgColor }}>
                {t('transactions:entry.actions.cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('transactions:entry.actions.save')}
              disabled={saving}
              onPress={handleSave}
              style={{
                flex: 2,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: tokens.accent.dashboard,
                opacity: saving ? 0.5 : 1,
                minHeight: 44,
              }}
            >
              <Text className="font-sans-medium text-white text-sm">
                {saving ? t('transactions:entry.actions.saving') : t('transactions:entry.actions.save')}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

type PickerCommonProps = {
  isDark: boolean;
  t: TFunction;
};

type AccountPickerProps = PickerCommonProps & {
  label: string;
  accounts: Account[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function AccountPicker({ label, accounts, selectedId, onSelect, isDark, t }: AccountPickerProps) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  return (
    <Card padding="lg" className="mb-4">
      <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
        {label}
      </Text>
      {accounts.length === 0 ? (
        <Text className="font-sans text-sm" style={{ color: mutedColor }}>
          {t('transactions:entry.pickers.noAccounts')}
        </Text>
      ) : (
        accounts.map((acct) => {
          const tint = resolveCategoryColor(acct.color, isDark ? 'dark' : 'light');
          const selected = selectedId === acct.id;
          return (
            <Pressable
              key={acct.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelect(acct.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: selected ? tokens.accent.dashboard : borderColor,
                backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                marginBottom: 6,
              }}
            >
              <View style={{
                width: 28, height: 28, borderRadius: 7, backgroundColor: tint + '22',
                alignItems: 'center', justifyContent: 'center', marginRight: 10,
              }}>
                <CategoryIcon name={acct.icon} color={tint} size={14} />
              </View>
              <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }} numberOfLines={1}>
                {acct.name}
              </Text>
              <Text className="font-sans text-xs" style={{ color: mutedColor }}>
                {t(`accounts:subtypes.${acct.subtype}`)}
              </Text>
            </Pressable>
          );
        })
      )}
    </Card>
  );
}

type CategoryPickerProps = PickerCommonProps & {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  lang: Locale;
};

function CategoryPicker({ categories, selectedId, onSelect, isDark, lang, t }: CategoryPickerProps) {
  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  // Group leaf categories under their parent. Custom user-created
  // categories with parentId === null and no children are shown as
  // standalone selectable rows (no group header).
  const { groups, standalone } = useMemo(() => {
    const parents = categories.filter((c) => c.parentId === null);
    const grouped = parents
      .map((parent) => ({
        parent,
        children: categories
          .filter((c) => c.parentId === parent.id)
          .sort((a, b) => a.order - b.order),
      }))
      .filter((g) => g.children.length > 0)
      .sort((a, b) => a.parent.order - b.parent.order);
    const childlessTopLevel = parents
      .filter((p) => !categories.some((c) => c.parentId === p.id))
      .sort((a, b) => a.order - b.order);
    return { groups: grouped, standalone: childlessTopLevel };
  }, [categories]);

  // Auto-expand the group containing the currently-selected category so
  // users see their selection without an extra tap. Other groups stay
  // collapsed for a clean default.
  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    if (selectedId) {
      const sel = categories.find((c) => c.id === selectedId);
      if (sel?.parentId) set.add(sel.parentId);
    }
    return set;
  }, [selectedId, categories]);
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  // Re-expand if the NLP parser populates a new selection in a different
  // group while the picker is mounted.
  useEffect(() => {
    if (!selectedId) return;
    const sel = categories.find((c) => c.id === selectedId);
    if (!sel?.parentId) return;
    setExpanded((prev) => (prev.has(sel.parentId!) ? prev : new Set([...prev, sel.parentId!])));
  }, [selectedId, categories]);

  function toggleGroup(parentId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }

  const totalCategories = groups.reduce((sum, g) => sum + g.children.length, 0) + standalone.length;

  return (
    <Card padding="lg" className="mb-4">
      <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
        {t('transactions:entry.fields.category')}
      </Text>
      {totalCategories === 0 ? (
        <Text className="font-sans text-sm" style={{ color: mutedColor }}>
          {t('transactions:entry.pickers.noCategories')}
        </Text>
      ) : (
        <>
          {groups.map(({ parent, children }) => {
            const isExpanded = expanded.has(parent.id);
            const parentTint = resolveCategoryColor(parent.color, isDark ? 'dark' : 'light');
            const containsSelected = children.some((c) => c.id === selectedId);
            return (
              <View
                key={parent.id}
                style={{
                  borderWidth: 1,
                  borderColor: containsSelected ? tokens.accent.dashboard : borderColor,
                  borderRadius: 10,
                  marginBottom: 8,
                  overflow: 'hidden',
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  onPress={() => toggleGroup(parent.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 10,
                    backgroundColor: containsSelected ? tokens.accent.dashboard + '14' : 'transparent',
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      backgroundColor: parentTint + '22',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}
                  >
                    <CategoryIcon name={parent.icon} color={parentTint} size={14} />
                  </View>
                  <Text className="font-sans-medium text-sm flex-1" style={{ color: fgColor }}>
                    {parent.name[lang]}
                  </Text>
                  {isExpanded ? (
                    <ChevronDown size={16} color={mutedColor} />
                  ) : (
                    <ChevronRight size={16} color={mutedColor} />
                  )}
                </Pressable>
                {isExpanded ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 6,
                      padding: 10,
                      borderTopWidth: 1,
                      borderTopColor: borderColor,
                    }}
                  >
                    {children.map((child) => {
                      const tint = resolveCategoryColor(child.color, isDark ? 'dark' : 'light');
                      const selected = selectedId === child.id;
                      return (
                        <Pressable
                          key={child.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          onPress={() => onSelect(child.id)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: selected ? tokens.accent.dashboard : borderColor,
                            backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                          }}
                        >
                          <CategoryIcon name={child.icon} color={tint} size={12} />
                          <Text className="font-sans-medium text-xs ml-1.5" style={{ color: fgColor }}>
                            {child.name[lang]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
          {/* Custom user-created standalone categories — no group, just chips. */}
          {standalone.length > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 4,
              }}
            >
              {standalone.map((cat) => {
                const tint = resolveCategoryColor(cat.color, isDark ? 'dark' : 'light');
                const selected = selectedId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => onSelect(cat.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: selected ? tokens.accent.dashboard : borderColor,
                      backgroundColor: selected ? tokens.accent.dashboard + '14' : 'transparent',
                    }}
                  >
                    <CategoryIcon name={cat.icon} color={tint} size={12} />
                    <Text className="font-sans-medium text-xs ml-1.5" style={{ color: fgColor }}>
                      {cat.name[lang]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

// Amount-input helpers were extracted to `shared/utils/amountInput.ts`
// in T9 / ADR-10 once a third screen (/budgets) needed the same logic.
