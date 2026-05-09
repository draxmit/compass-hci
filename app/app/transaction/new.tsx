import type { Account, Category, TransactionType } from '@compass/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { Camera as CameraIcon, ChevronDown, ChevronLeft, ChevronRight, Layers, Mic, MicOff, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ActivityIndicator, BackHandler, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { subscribeAccounts } from '@/services/firestore/accountsService';
import { subscribeCategories } from '@/services/firestore/categoriesService';
import {
  createTransaction, InsufficientBalanceError, subscribeRecent,
} from '@/services/firestore/transactionsService';
import { useAuthUser, useUserDoc } from '@/stores/authStore';
import { SplitsEditorModal } from '@/features/transactions/SplitsEditorModal';
import { SplitsSummaryCard } from '@/features/transactions/SplitsSummaryCard';
import { TagsInput } from '@/features/transactions/TagsInput';
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
import {
  formatAmountInput, minorToInputText, parseAmountInput,
} from '@/shared/utils/amountInput';
import { formatIDR } from '@/shared/utils/formatIDR';
import { formatCurrency } from '@/shared/utils/formatCurrency';
import { convertFromIDRMinor, convertToIDRMinor } from '@/shared/utils/fxRates';
import { parseTransaction } from '@/shared/utils/nlpParser';
import type { NlpResult } from '@/shared/utils/nlpParser';
import { collectTagFrequencies, normaliseTagList } from '@/shared/utils/tags';
import { useVoiceInput } from '@/shared/utils/voiceInput';
import { buildContextSnapshot } from '@/features/ask/contextSnapshot';
import { isConfigured as isGeminiConfigured, parseTextWithGemini } from '@/features/ask/geminiClient';
import { useCategorySuggestion } from '@/features/transactions/useCategorySuggestion';

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

/**
 * 'YYYY-MM-DD' for today in LOCAL time. Mirrors the preset menu and
 * DateField's formatIso convention. We can't use
 * `new Date().toISOString().slice(0, 10)` because that returns UTC —
 * users in UTC+7 (Jakarta) typing during early-morning hours would
 * end up with yesterday's date silently stamped on the tx, which
 * pushes the row down the recent list and was the apparent cause of
 * "I added a tx but it doesn't show up" reports. Local time matches
 * what the user sees on their device clock and what the preset menu
 * uses for instant-create.
 */
function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function NewTransactionScreen() {
  const { t, i18n } = useTranslation(['transactions', 'accounts', 'categories', 'common']);
  const router = useRouter();
  const appAlert = useAppAlert();
  const insets = useSafeAreaInsets();
  const { resolvedScheme } = useTheme();
  const isDark = resolvedScheme === 'dark';
  const lang = (i18n.language === 'en' ? 'en' : 'id') as Locale;
  const user = useAuthUser();
  const userDoc = useUserDoc();
  const wid = user ? `solo-${user.uid}` : null;
  const pinnedGoalId = userDoc?.pinnedGoalId ?? null;
  // Source tab passed by the FAB / welcome cards via ?from=. Used as the
  // close-fallback target when there's no Stack frame to pop (we arrived
  // via router.replace, not push). Falls back to /transactions if absent
  // or invalid.
  // OCR params arrive when the user came from /transaction/scan-receipt.
  //   - `ocrAmount`     stringified minor-units integer ('5000000' = Rp 50.000)
  //   - `ocrMerchant`   merchant name ('Warteg Bahari')
  //   - `ocrCategoryId` Gemini's best-guess category id (multimodal vision only)
  //   - `ocrDate`       receipt date as 'YYYY-MM-DD' (multimodal vision only)
  // Each is independent — receipt photos and Gemini's confidence vary
  // by field. We apply each only if (a) the param is present AND
  // (b) the user hasn't yet manually edited that field, mirroring the
  // touched[] guard the NLP path uses.
  const params = useLocalSearchParams<{
    from?: string;
    ocrAmount?: string;
    ocrMerchant?: string;
    ocrCategoryId?: string;
    ocrDate?: string;
    // Quick-add preset prefill — set when the user taps an
    // incomplete preset that's missing one or more fields. The
    // preset menu navigates here with whichever fields it knows;
    // the form pre-fills them and the user enters the rest.
    presetType?: string;
    presetAmount?: string;
    presetAccount?: string;
    presetCategory?: string;
    presetDescription?: string;
  }>();
  const fromTab: Href = resolveFrom(params.from);

  const fgColor = isDark ? tokens.surface['dark-fg'] : tokens.surface['light-fg'];
  const mutedColor = isDark ? tokens.surface['dark-fg-muted'] : tokens.surface['light-fg-muted'];
  const overlayBg = isDark ? tokens.surface['dark-bg'] : tokens.surface['light-bg'];
  const borderColor = isDark ? tokens.surface['dark-border'] : tokens.surface['light-border'];

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // Recent transactions feed the tag-suggestion list. Subscribing to
  // the same `recent 50` slice the Transactions tab uses keeps the
  // suggestion list responsive to newly-applied tags without a
  // separate query path. Cap of 50 is more than enough to surface
  // ~10–15 distinct tags.
  const [recentTagSet, setRecentTagSet] = useState<string[]>([]);

  // Form state — populated by NLP, overrideable by user.
  const [type, setType] = useState<TransactionType>('expense');
  const [amountText, setAmountText] = useState('');
  // For non-IDR source accounts: which currency the user is TYPING
  // the amount in. Default 'native' (the account's currency); flip
  // to 'IDR' to type in rupiah and have the service convert at save.
  // The toggle only renders when the source account's currency !== IDR.
  const [amountInputMode, setAmountInputMode] = useState<'native' | 'IDR'>('native');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  // Optional admin/transfer fee. Transfer-only — when type flips off
  // 'transfer' we keep the value in state so it returns if the user
  // toggles back, but it's only included in the payload for transfers.
  const [feeText, setFeeText] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [date, setDate] = useState(todayLocalIso);  // 'YYYY-MM-DD' local — editable via DateField
  const [nlpInput, setNlpInput] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [saving, setSaving] = useState(false);

  // Splits state (ADR-14). Default = single-category mode (categoryId
  // above is the source of truth). Switching to multi-mode seeds the
  // splits array with one row carrying the existing categoryId + the
  // current total amount, then the user adds rows.
  const [splitsMode, setSplitsMode] = useState<'single' | 'multi'>('single');
  const [splitRows, setSplitRows] = useState<{ categoryId: string | null; amountText: string }[]>([]);
  // Modal-open state for the splits editor (D4 redesign — multi-split
  // editing is no longer inline). When `multi` mode is active and the
  // modal is closed, the form shows a compact summary card instead.
  const [splitsModalOpen, setSplitsModalOpen] = useState(false);

  // Voice input → NLP field. Web uses the browser SpeechRecognition
  // API; native uses expo-speech-recognition (SiriKit on iOS, Google
  // Speech Service on Android). Metro picks `voiceInput.native.ts`
  // for native and `voiceInput.ts` for web — same external shape.
  //
  // After the transcript settles, we ALSO try a Gemini /parse-text
  // round-trip in the background (ADR-23 multimodal extension). The
  // native nlpParser still runs synchronously on every keystroke so
  // the form pre-fills immediately; Gemini comes in a moment later
  // and overrides any not-touched fields with its richer results.
  const lastVoiceTranscriptRef = useRef<string | null>(null);
  const [voiceParseTrigger, setVoiceParseTrigger] = useState(0);
  const [geminiParsing, setGeminiParsing] = useState(false);

  const voice = useVoiceInput({
    locale: lang,
    onResult: (transcript) => {
      // Append to whatever's already in the input rather than replacing —
      // user might be mid-sentence dictating extra detail.
      setNlpInput((prev) => {
        const merged = prev ? `${prev} ${transcript}` : transcript;
        lastVoiceTranscriptRef.current = merged;
        return merged;
      });
      // Bump trigger so the Gemini-parse effect below re-runs on the
      // newly-merged text. Counter pattern so consecutive identical
      // transcripts still re-fire.
      setVoiceParseTrigger((n) => n + 1);
    },
  });

  // Per-field "touched-by-user" flags so re-parsing on every keystroke
  // doesn't clobber fields the user has manually edited.
  const touched = useRef<{ type: boolean; amount: boolean; account: boolean; toAccount: boolean; category: boolean; description: boolean }>({
    type: false, amount: false, account: false, toAccount: false, category: false, description: false,
  });

  useEffect(() => {
    if (!wid) return;
    const unsubA = subscribeAccounts(wid, setAccounts);
    const unsubC = subscribeCategories(wid, setCategories);
    // Pull recent 50 to seed tag suggestions. We only need the `tags`
    // field but the service doesn't have a projection helper; the 50
    // doc cap keeps the read cheap (~50 reads × 1 string array each).
    const unsubR = subscribeRecent(wid, 50, (txs) => {
      const freq = collectTagFrequencies(txs);
      setRecentTagSet([...freq.keys()]);
    });
    return () => { unsubA(); unsubC(); unsubR(); };
  }, [wid]);

  // One-shot apply of OCR params from /transaction/scan-receipt. The
  // scanner navigates here via router.replace with ?ocrAmount=<minor>
  // &ocrMerchant=<name>; we pre-fill amount + description on first
  // mount and mark those fields as touched so the NLP re-parse doesn't
  // clobber them later. Guarded with a ref so a re-render doesn't
  // re-apply (which would override edits the user made post-scan).
  const ocrAppliedRef = useRef(false);
  useEffect(() => {
    if (ocrAppliedRef.current) return;
    const { ocrAmount, ocrMerchant, ocrCategoryId, ocrDate } = params;
    if (!ocrAmount && !ocrMerchant && !ocrCategoryId && !ocrDate) return;
    if (ocrAmount) {
      const minor = Number(ocrAmount);
      if (Number.isFinite(minor) && minor > 0) {
        touched.current.amount = true;
        setAmountText(minorToInputText(minor, lang));
      }
    }
    if (ocrMerchant) {
      touched.current.description = true;
      setDescription(ocrMerchant);
    }
    // Gemini multimodal vision returns the best-matching categoryId
    // from the user's snapshot; the regex parser doesn't know about
    // categories so this is a Gemini-only field.
    if (ocrCategoryId) {
      touched.current.category = true;
      setCategoryId(ocrCategoryId);
    }
    // Receipt date — apply if it's a valid YYYY-MM-DD AND it's not in
    // the future (defends against OCR misreading a year). Local time
    // matches the user's device clock — UTC would mark a tx scanned
    // late evening Jakarta as "tomorrow" and reject it.
    if (ocrDate && /^\d{4}-\d{2}-\d{2}$/.test(ocrDate)) {
      const today = todayLocalIso();
      if (ocrDate <= today) {
        setDate(ocrDate);
      }
    }
    ocrAppliedRef.current = true;
  }, [params, lang]);

  // Quick-add preset prefill (parallel to OCR). Same touched-by-user
  // guard pattern: each field is applied only on first mount, marked
  // touched so subsequent NLP re-parses don't clobber.
  const presetAppliedRef = useRef(false);
  useEffect(() => {
    if (presetAppliedRef.current) return;
    const {
      presetType, presetAmount, presetAccount, presetCategory, presetDescription,
    } = params;
    if (!presetType && !presetAmount && !presetAccount && !presetCategory && !presetDescription) return;
    if (presetType === 'expense' || presetType === 'income') {
      touched.current.type = true;
      setType(presetType);
    }
    if (presetAmount) {
      const minor = Number(presetAmount);
      if (Number.isFinite(minor) && minor > 0) {
        touched.current.amount = true;
        setAmountText(minorToInputText(minor, lang));
      }
    }
    if (presetAccount) {
      touched.current.account = true;
      setAccountId(presetAccount);
    }
    if (presetCategory) {
      touched.current.category = true;
      setCategoryId(presetCategory);
    }
    if (presetDescription) {
      touched.current.description = true;
      setDescription(presetDescription);
    }
    presetAppliedRef.current = true;
  }, [params, lang]);

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

  // Voice-triggered Gemini upgrade. Fires after the user finishes
  // speaking — uses the merged transcript captured in the ref. Falls
  // back silently if Gemini isn't configured (the native parser
  // already populated the form), so first-time users without the
  // Worker URL set still get a working voice flow.
  useEffect(() => {
    if (voiceParseTrigger === 0) return;
    const text = lastVoiceTranscriptRef.current;
    if (!text || !wid) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!(await isGeminiConfigured())) return;
        setGeminiParsing(true);
        const ctx = await buildContextSnapshot(wid, lang, pinnedGoalId);
        const { parsed } = await parseTextWithGemini(text, ctx);
        if (cancelled) return;
        // Apply Gemini's richer parse, respecting user edits via the
        // existing touched-flags. Gemini overrides the native parser's
        // earlier output for fields the user hasn't touched.
        if (parsed.type && !touched.current.type) setType(parsed.type);
        if (parsed.amountMinor != null && !touched.current.amount) {
          setAmountText(minorToInputText(parsed.amountMinor, lang));
        }
        if (parsed.accountId && !touched.current.account) {
          setAccountId(parsed.accountId);
        }
        if (parsed.toAccountId && !touched.current.toAccount) {
          setToAccountId(parsed.toAccountId);
        }
        if (parsed.categoryId && !touched.current.category) {
          setCategoryId(parsed.categoryId);
        }
        if (parsed.description && !touched.current.description) {
          setDescription(parsed.description);
        }
        // Gemini's confidence usually beats the regex parser's; if we
        // got a useful number, surface it on the chip.
        if (parsed.confidence > 0) setConfidence(parsed.confidence);
      } catch {
        // Silent — native parser already populated the form.
      } finally {
        if (!cancelled) setGeminiParsing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [voiceParseTrigger, wid, lang, pinnedGoalId]);

  const handleSave = async () => {
    if (saving || !wid) return;
    const rawAmount = parseAmountInput(amountText, lang);
    if (!rawAmount) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.errors.missingAmount'));
      return;
    }
    if (!accountId) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.errors.missingAccount'));
      return;
    }
    // If user typed in IDR mode but the source account is non-IDR,
    // convert before persisting. The Transaction.amount field is
    // always in the source account's NATIVE currency (per ADR-16);
    // amountIDR is computed by the service from amount × FX rate.
    // So we convert IDR→native here once, then the service rederives
    // amountIDR symmetrically for storage.
    const sourceAcc = accounts.find((a) => a.id === accountId);
    const sourceCurrency = sourceAcc?.currency ?? 'IDR';
    const amount = (sourceCurrency !== 'IDR' && amountInputMode === 'IDR')
      ? convertFromIDRMinor(rawAmount, sourceCurrency)
      : rawAmount;
    if (type === 'transfer' && !toAccountId) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.errors.missingToAccount'));
      return;
    }
    if (type === 'transfer' && accountId === toAccountId) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.errors.sameAccount'));
      return;
    }

    // Build splits[] payload — depends on mode (per ADR-14).
    let splits: { categoryId: string; amount: number }[] = [];
    if (type !== 'transfer') {
      if (splitsMode === 'multi') {
        // Multi-mode: each row must have category + positive amount, and
        // the sum must match the total. Split row amounts respect the
        // same currency-input mode as the top-level amount, so we
        // run them through the same convert step before the sum-equals
        // check (which compares against `amount`, already native).
        const parsed = splitRows.map((r) => {
          const raw = parseAmountInput(r.amountText, lang);
          const converted = (sourceCurrency !== 'IDR' && amountInputMode === 'IDR')
            ? convertFromIDRMinor(raw, sourceCurrency)
            : raw;
          return { categoryId: r.categoryId, amount: converted };
        });
        if (parsed.some((r) => !r.categoryId)) {
          appAlert(t('transactions:entry.title'), t('transactions:entry.errors.splitsMissingCategory'));
          return;
        }
        const sum = parsed.reduce((s, r) => s + r.amount, 0);
        if (sum !== amount) {
          appAlert(t('transactions:entry.title'), t('transactions:entry.errors.splitsMustSumToTotal'));
          return;
        }
        splits = parsed.map((r) => ({ categoryId: r.categoryId as string, amount: r.amount }));
      } else {
        if (!categoryId) {
          appAlert(t('transactions:entry.title'), t('transactions:entry.errors.missingCategory'));
          return;
        }
        splits = [{ categoryId, amount }];
      }
    }

    setSaving(true);
    try {
      // Parse the optional fee. parseAmountInput returns 0 for empty
      // strings — perfect, the service ignores 0 fees defensively.
      // Spread conditionally so the field is omitted entirely when 0
      // (strict optional types reject `feeMinor: undefined` at the
      // call boundary). The fee is in the SAME currency-input mode
      // as the main amount (rare for users to mix); we convert it
      // through the same path.
      const rawFeeMinor = type === 'transfer'
        ? parseAmountInput(feeText, lang)
        : 0;
      const feeMinor = (rawFeeMinor > 0 && sourceCurrency !== 'IDR' && amountInputMode === 'IDR')
        ? convertFromIDRMinor(rawFeeMinor, sourceCurrency)
        : rawFeeMinor;
      await createTransaction(wid, {
        type,
        date,
        accountId,
        toAccountId: type === 'transfer' ? toAccountId : null,
        currency: sourceCurrency,
        amount,
        ...(feeMinor > 0 ? { feeMinor } : {}),
        splits,
        description: description.trim() || (nlpInput.trim() || ''),
        // Defensive normalisation at the boundary in case the chip
        // input ever lets through an unnormalised value (e.g.
        // pasted-from-clipboard text).
        tags: normaliseTagList(tags),
        source: nlpInput.trim() ? 'nlp' : 'manual',
        rawInput: nlpInput.trim() || null,
        confidence: nlpInput.trim() ? confidence : null,
      });
      closeScreen();
    } catch (err: unknown) {
      // Friendly surface for the no-negative-balance gate (ADR-22).
      // Generic Firestore failures fall through to the createFailed
      // copy so we don't show raw stack traces.
      if (err instanceof InsufficientBalanceError) {
        appAlert(
          t('transactions:entry.title'),
          t('transactions:entry.errors.insufficientBalance'),
        );
      } else {
        const msg = err instanceof Error ? err.message : t('transactions:entry.errors.createFailed');
        appAlert(t('transactions:entry.title'), msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const enterMultiMode = () => {
    // Block split-mode entry until the user has entered a total
    // amount. Splits exist to divide that total across categories
    // — without it, the modal can't show "X / Total" and Done can't
    // verify the sum. Surface the friendly explanation rather than
    // letting the user open an inert modal.
    const totalAmount = parseAmountInput(amountText, lang);
    if (totalAmount <= 0) {
      appAlert(
        t('transactions:entry.title'),
        t('transactions:entry.errors.splitsNeedTotal'),
      );
      return;
    }
    // Seed with one row carrying the current single-mode selections
    // — full amount goes to the existing categoryId so a fresh modal
    // open on a single tx already shows balanced.
    setSplitRows([
      {
        categoryId: categoryId,
        amountText: minorToInputText(totalAmount, lang),
      },
    ]);
    setSplitsMode('multi');
    setSplitsModalOpen(true);
  };

  const exitMultiMode = () => {
    // Collapse back to single. Take the first row's category as the
    // single-mode categoryId. If multiple rows existed, the others are
    // dropped — surface the warning copy.
    if (splitRows.length > 1) {
      appAlert(t('transactions:entry.title'), t('transactions:entry.splits.collapseWarning'));
    }
    const first = splitRows[0];
    if (first?.categoryId) {
      touched.current.category = true;
      setCategoryId(first.categoryId);
    }
    setSplitsMode('single');
    setSplitsModalOpen(false);
  };

  const closeSplitsModal = () => {
    // If the user cancels the modal without picking any category in
    // any row, revert to single mode — otherwise the form is stuck
    // in multi mode showing a summary of empty rows, which form-save
    // then rejects. Empty rows = nothing was committed, so revert.
    if (splitRows.every((r) => !r.categoryId)) {
      setSplitsMode('single');
      setSplitsModalOpen(false);
      return;
    }
    setSplitsModalOpen(false);
  };

  const addSplitRow = () => {
    setSplitRows((rows) => [...rows, { categoryId: null, amountText: '' }]);
  };

  const removeSplitRow = (idx: number) => {
    setSplitRows((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)));
  };

  const updateSplitRow = (idx: number, patch: Partial<{ categoryId: string | null; amountText: string }>) => {
    setSplitRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const accountOptions = useMemo(() => accounts, [accounts]);

  // AI category suggestion (#8). Watches the description field and
  // proposes a category when the user hasn't picked one. Only fires
  // for expense transactions; degrades silently when Gemini is
  // unreachable.
  const suggestion = useCategorySuggestion({
    description,
    type,
    hasManualCategory: touched.current.category && categoryId !== null,
    categories,
    accounts,
    lang,
  });

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
        <View className="self-center w-full max-w-md lg:max-w-3xl">
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

          {/* NLP quick-entry — text + (web) voice */}
          <Card padding="lg" className="mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="font-sans-medium text-xs uppercase tracking-wider" style={{ color: mutedColor }}>
                {t('transactions:entry.nlpLabel')}
              </Text>
              {geminiParsing ? (
                <View className="flex-row items-center" style={{ gap: 6 }}>
                  <ActivityIndicator size="small" color={tokens.accent.dashboard} />
                  <Text
                    className="font-sans text-xs"
                    style={{ color: tokens.accent.dashboard }}
                  >
                    {t('transactions:entry.aiParsing')}
                  </Text>
                </View>
              ) : confidence > 0 ? (
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
            {/* Voice + scan buttons in a 1×2 grid below the input. The
                previous side-by-side layout cluttered the row on
                mobile (3 controls in a single line); stacking them
                gives the input full width and the action buttons a
                more discoverable, tappable footprint. */}
            <View className="flex-row" style={{ gap: 8, marginTop: 8 }}>
              {/* Voice button — works on web (browser SpeechRecognition
                  API) and native (expo-speech-recognition wrapping
                  SiriKit / Google Speech). The voiceInput hook splits
                  between voiceInput.ts and voiceInput.native.ts; both
                  expose the same shape so the UI is platform-agnostic. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  voice.isListening
                    ? t('transactions:entry.voice.stop')
                    : t('transactions:entry.voice.start')
                }
                accessibilityState={{ disabled: !voice.supported }}
                onPress={() => {
                  if (!voice.supported) {
                    appAlert(
                      t('transactions:entry.voice.unavailableTitle'),
                      t('transactions:entry.voice.unavailableBrowser'),
                    );
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
                  borderColor: voice.isListening ? tokens.accent.transactions : borderColor,
                  backgroundColor: voice.isListening ? tokens.accent.transactions + '22' : 'transparent',
                  minHeight: 40,
                }}
              >
                {voice.isListening ? (
                  <MicOff size={16} color={tokens.accent.transactions} />
                ) : (
                  <Mic size={16} color={mutedColor} />
                )}
                <Text
                  className="font-sans-medium text-xs"
                  style={{
                    color: voice.isListening ? tokens.accent.transactions : mutedColor,
                  }}
                >
                  {voice.isListening
                    ? t('transactions:entry.voice.buttonActive')
                    : t('transactions:entry.voice.buttonIdle')}
                </Text>
              </Pressable>
              {/* Scan-receipt button — opens the full-screen camera
                  scanner. Native only; on web we surface the same
                  unavailable alert the scan screen uses internally so
                  users discover the limitation without a navigation
                  round-trip. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('transactions:entry.scanReceipt.title')}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    appAlert(
                      t('transactions:entry.scanReceipt.webUnavailableTitle'),
                      t('transactions:entry.scanReceipt.webUnavailableBody'),
                    );
                    return;
                  }
                  router.push('/transaction/scan-receipt');
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
                  borderColor,
                  backgroundColor: 'transparent',
                  minHeight: 40,
                }}
              >
                <CameraIcon size={16} color={mutedColor} />
                <Text className="font-sans-medium text-xs" style={{ color: mutedColor }}>
                  {t('transactions:entry.scanReceipt.buttonLabel')}
                </Text>
              </Pressable>
            </View>
            <Text className="font-sans text-xs mt-2" style={{ color: mutedColor }}>
              {voice.isListening
                ? t('transactions:entry.voice.listening')
                : t('transactions:entry.nlpHint')}
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

          {/* Amount + Date — both small fields in the same card with an
              internal divider, mirroring the consolidation pattern from
              the Notes card below. */}
          <Card padding="lg" className="mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="font-sans-medium text-xs uppercase tracking-wider" style={{ color: mutedColor }}>
                {t('transactions:entry.fields.amount')}
              </Text>
              {/* Currency-input toggle. Only renders when the source
                  account's currency is non-IDR. Lets the user type in
                  EITHER the account's native currency OR IDR — useful
                  for Indonesian users with USD accounts who think in
                  rupiah but want the deduction recorded against USD-
                  cents accurately. The convert-to-account-native step
                  happens once at save time. */}
              {(() => {
                const sourceAccount = accounts.find((a) => a.id === accountId);
                const accCurrency = sourceAccount?.currency ?? 'IDR';
                if (accCurrency === 'IDR') return null;
                const modes: { mode: 'native' | 'IDR'; label: string }[] = [
                  { mode: 'native', label: accCurrency },
                  { mode: 'IDR', label: 'IDR' },
                ];
                return (
                  <View
                    style={{
                      flexDirection: 'row',
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 999,
                      padding: 2,
                      gap: 2,
                    }}
                  >
                    {modes.map((m) => {
                      const selected = amountInputMode === m.mode;
                      return (
                        <Pressable
                          key={m.mode}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          onPress={() => setAmountInputMode(m.mode)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 999,
                            backgroundColor: selected ? tokens.accent.transactions + '22' : 'transparent',
                          }}
                        >
                          <Text
                            className="font-sans-medium text-[11px]"
                            style={{ color: selected ? tokens.accent.transactions : mutedColor }}
                          >
                            {m.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })()}
            </View>
            <TextField
              label=""
              value={amountText}
              onChangeText={(v) => { touched.current.amount = true; setAmountText(formatAmountInput(v, lang)); }}
              placeholder={t('transactions:entry.fields.amountPlaceholder')}
              keyboardType="numeric"
              returnKeyType="done"
            />
            {amountText ? (() => {
              const parsedRaw = parseAmountInput(amountText, lang);
              const sourceAccount = accounts.find((a) => a.id === accountId);
              const accCurrency = sourceAccount?.currency ?? 'IDR';
              // The "equivalent" caption depends on what the user is
              // typing in. Native mode: show IDR equivalent. IDR mode:
              // show native equivalent. Both directions go through
              // the existing FX snapshot.
              if (accCurrency === 'IDR') {
                return (
                  <Text className="font-mono tabular-nums text-xs mt-2" style={{ color: mutedColor }}>
                    {formatIDR(parsedRaw)}
                  </Text>
                );
              }
              // Non-IDR account.
              if (amountInputMode === 'native') {
                const idrEq = convertToIDRMinor(parsedRaw, accCurrency);
                return (
                  <Text className="font-mono tabular-nums text-xs mt-2" style={{ color: mutedColor }}>
                    {`≈ ${formatIDR(idrEq, lang)}`}
                  </Text>
                );
              }
              // amountInputMode === 'IDR' — typed amount is IDR-major,
              // show what that converts to in the account's currency.
              const nativeEq = convertFromIDRMinor(parsedRaw, accCurrency);
              return (
                <Text className="font-mono tabular-nums text-xs mt-2" style={{ color: mutedColor }}>
                  {`≈ ${formatCurrency(nativeEq, accCurrency, lang)}`}
                </Text>
              );
            })() : null}

            <View
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: borderColor,
              }}
            >
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
                {t('transactions:entry.fields.date')}
              </Text>
              <DateField
                value={date}
                onChange={(next) => {
                  // Empty = revert to today rather than leaving blank.
                  // Tx must always have a date.
                  if (!next) {
                    setDate(todayLocalIso());
                    return;
                  }
                  setDate(next);
                }}
                lang={lang}
                accessibilityLabel={t('transactions:entry.fields.date')}
              />
            </View>
          </Card>

          {/* From account / single account */}
          <AccountPicker
            label={t(type === 'transfer' ? 'transactions:entry.fields.fromAccount' : 'transactions:entry.fields.account')}
            accounts={accountOptions}
            selectedId={accountId}
            onSelect={(id) => {
              touched.current.account = true;
              setAccountId(id);
              // Reset input-currency mode whenever the account
              // changes — picking a different-currency account
              // would otherwise leave a stale 'IDR' mode active
              // and silently re-interpret the amount.
              setAmountInputMode('native');
            }}
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

          {/* Admin / transfer fee (transfer only, optional). Some banks
              and e-wallets charge a small fee for inter-bank transfers
              (e.g. Rp 6.500 BI-FAST, Rp 2.500 GoPay-to-bank). When
              filled, the fee is deducted from the source account on
              top of the transfer amount; the destination still
              receives the full amount. Empty means no fee. */}
          {type === 'transfer' ? (
            <View className="mb-5">
              <Text
                className="font-sans-medium text-xs uppercase tracking-wider mb-2"
                style={{ color: mutedColor }}
              >
                {t('transactions:entry.fields.fee')}
              </Text>
              <TextField
                label=""
                value={feeText}
                onChangeText={(text) => {
                  // Same locale-aware formatting as the main amount field.
                  setFeeText(formatAmountInput(text, lang));
                }}
                placeholder={t('transactions:entry.fields.feePlaceholder')}
                keyboardType="numeric"
              />
              <Text
                className="font-sans text-xs mt-1.5"
                style={{ color: mutedColor }}
              >
                {t('transactions:entry.fields.feeHint')}
              </Text>
            </View>
          ) : null}

          {/* Category (expense / income only). Single mode shows the
              full chip grid; multi mode replaces it with a compact
              summary card + Edit button — actual editing now happens
              in a modal (D4 redesign). */}
          {type !== 'transfer' ? (
            <>
              {splitsMode === 'single' ? (
                <CategoryPicker
                  categories={categories}
                  selectedId={categoryId}
                  onSelect={(id) => { touched.current.category = true; setCategoryId(id); }}
                  isDark={isDark}
                  lang={lang}
                  t={t}
                  onRequestSplit={enterMultiMode}
                />
              ) : (
                <SplitsSummaryCard
                  rows={splitRows}
                  categories={categories}
                  isDark={isDark}
                  lang={lang}
                  onEdit={() => setSplitsModalOpen(true)}
                  onCollapse={exitMultiMode}
                  t={t}
                />
              )}
            </>
          ) : null}

          {/* Splits editor modal — opened by enterMultiMode + the Edit
              button inside SplitsSummaryCard. closeSplitsModal also
              reverts to single mode when the user cancels without
              picking any categories. */}
          {type !== 'transfer' ? (
            <SplitsEditorModal
              visible={splitsModalOpen}
              onClose={closeSplitsModal}
              onConfirm={() => setSplitsModalOpen(false)}
              rows={splitRows}
              totalText={amountText}
              categories={categories}
              lang={lang}
              onAddRow={addSplitRow}
              onRemoveRow={removeSplitRow}
              onUpdateRow={updateSplitRow}
              t={t}
            />
          ) : null}

          {/* Notes group: Description + Tags. Both are non-financial
              metadata that the user adds AFTER the core 'what / where'
              decisions are made. Combined into one Card with internal
              divider so the bottom of the form stays compact. */}
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
            {/* AI category suggestion chip (#8). Renders only when the
                LLM returned a confident category match for the typed
                description AND the user hasn't picked one yet. Tap
                the body to apply, tap × to dismiss for this description. */}
            {suggestion.suggested ? (
              <View
                style={{
                  marginTop: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: tokens.accent.dashboard + '14',
                  borderWidth: 1,
                  borderColor: tokens.accent.dashboard + '44',
                }}
              >
                <Sparkles size={14} color={tokens.accent.dashboard} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('transactions:entry.aiCategory.applyLabel', {
                    category: suggestion.suggested.name[lang],
                  })}
                  onPress={() => {
                    if (!suggestion.suggested) return;
                    touched.current.category = true;
                    setCategoryId(suggestion.suggested.id);
                    suggestion.dismiss();
                  }}
                  style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.65 : 1 })}
                >
                  <Text
                    className="font-sans text-xs"
                    style={{ color: mutedColor }}
                    numberOfLines={1}
                  >
                    <Text style={{ color: tokens.accent.dashboard, fontWeight: '600' }}>
                      {t('transactions:entry.aiCategory.label')}
                    </Text>
                    {' '}
                    <Text style={{ color: fgColor, fontWeight: '600' }}>
                      {suggestion.suggested.name[lang]}
                    </Text>
                    {'  '}
                    <Text style={{ color: tokens.accent.dashboard }}>
                      {t('transactions:entry.aiCategory.tapToApply')}
                    </Text>
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common:actions.close')}
                  onPress={() => suggestion.dismiss()}
                  hitSlop={6}
                >
                  <Text style={{ color: mutedColor, fontSize: 14, fontWeight: '600' }}>×</Text>
                </Pressable>
              </View>
            ) : null}

            <View
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTopWidth: 1,
                borderTopColor: borderColor,
              }}
            >
              <Text className="font-sans-medium text-xs uppercase tracking-wider mb-3" style={{ color: mutedColor }}>
                {t('transactions:entry.fields.tags')}
              </Text>
              <TagsInput
                value={tags}
                onChange={setTags}
                suggestions={recentTagSet}
                accent={tokens.accent.transactions}
              />
            </View>
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
              <Text
                className="font-sans text-xs"
                style={{ color: mutedColor, marginLeft: 6, maxWidth: '40%' }}
                numberOfLines={1}
              >
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
  /**
   * Optional split-mode entry. When provided, renders a divider +
   * "Split across categories" button at the bottom of the picker
   * card so the action lives inside the Category section instead of
   * floating between cards (per user feedback).
   */
  onRequestSplit?: () => void;
};

function CategoryPicker({ categories, selectedId, onSelect, isDark, lang, t, onRequestSplit }: CategoryPickerProps) {
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
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{
                      gap: 6,
                      padding: 10,
                    }}
                    style={{
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
                  </ScrollView>
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
      {/* Split-mode entry — lives inside the Category card, not as a
          floating sibling button. Divider separates it from the chip
          grid above. Only renders when the parent passed onRequestSplit
          (i.e. only on expense / income, not transfers). */}
      {onRequestSplit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('transactions:entry.splits.toggleToMulti')}
          onPress={onRequestSplit}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            marginTop: 14,
            paddingTop: 14,
            paddingBottom: 4,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            minHeight: 40,
          }}
        >
          <Layers size={14} color={tokens.accent.transactions} />
          <Text
            className="font-sans-medium text-sm"
            style={{ color: tokens.accent.transactions }}
          >
            {t('transactions:entry.splits.toggleToMulti')}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

// Amount-input helpers were extracted to `shared/utils/amountInput.ts`
// in T9 / ADR-10 once a third screen (/budgets) needed the same logic.
