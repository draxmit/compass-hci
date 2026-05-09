// Shared types across the Compass monorepo.
// Populated by T2 (Auth + Firestore) and T6 (Transaction, Category).

/**
 * Per-user profile document.
 * Path: `users/{uid}`. Owner-only access (Firestore rules).
 *
 * `createdAt` is a Firestore server timestamp; on read it's a `Timestamp`,
 * but consumers don't need to import that here — code that parses dates
 * imports it from `firebase/firestore` directly. We type it as `unknown`
 * to keep the shared package free of firebase imports.
 */
export type UserDoc = {
  uid: string;
  email: string | null;
  displayName: string;
  locale: 'id' | 'en';
  theme: 'light' | 'dark' | 'system';
  baseCurrency: 'IDR' | 'USD';
  /**
   * Active budget style for the /budgets screen view (ADR-21).
   * Reuses the {@link BudgetStyle} union — all three values are
   * selectable in v2. Forward-declared here as an inline union so
   * UserDoc doesn't have to import BudgetStyle from later in the
   * file (BudgetStyle is declared further down).
   */
  budgetStyle: 'monthly_limit' | 'envelope' | 'fifty_thirty_twenty';
  biometricEnabled: boolean;
  /**
   * v2 multi-currency display preference. When `true`, every amount
   * surface (tx rows, account rows, recent strip, report's top-5)
   * renders the IDR-converted amount as the primary line with the
   * native amount muted underneath. When `false` (default), amounts
   * render in their native currency only — native-currency-first
   * (the source-of-truth balance the user's bank shows). Cross-account
   * aggregations (Net Worth, monthly totals, budgets) always sum in
   * IDR regardless of this preference. Optional on the doc to keep
   * legacy v1 docs compatible — read-side helpers default to `false`.
   */
  displayInIDR?: boolean;
  /**
   * Banking-app-style balance privacy. When `true`, large balance
   * amounts (Total Balance hero, per-account row balances, big-number
   * monthly totals) render as masked dots instead of digits, so the
   * user can use the app in public without exposing their balance.
   * Per-transaction amounts stay visible — same convention BCA / Mandiri /
   * Jenius use. Toggled via the eye icon next to Total Balance on the
   * Dashboard. Optional for backward compat with v3-and-earlier docs;
   * default false.
   */
  balancesHidden?: boolean;
  fcmTokens: string[];
  onboardingComplete: boolean;
  /**
   * Free-text goal the user enters in the onboarding wizard's first step
   * ("what are you saving for?"). T10 (ADR-11). v2.0 (ADR-20) deprecates
   * this in favour of `pinnedGoalId` — a one-shot migration on next
   * sign-in moves any non-empty value into a real Goal doc and clears
   * this field. Optional in the type so legacy reads don't break, but
   * post-migration it's always `null`. Onboarding step 1 still writes
   * here for the migration to pick up on the first authed render.
   */
  primaryGoal: string | null;
  /**
   * v2 (ADR-20) — id of the Goal doc that headlines on the Dashboard.
   * `null` when no goal is pinned (Dashboard pill hides). Setting this
   * is a single tap on the Pin button on /goals. Mutually exclusive
   * across goals — pinning one un-pins the previous (handled in
   * goalsService.setPinnedGoal). Optional on the doc to keep legacy
   * v1/v2-pre-pin docs compatible.
   */
  pinnedGoalId?: string | null;
  /**
   * v3 phase B (ADR-24) — local notification preferences. Stored on
   * the user doc so settings sync across the user's devices, even
   * though the actual scheduling happens per-device via expo-
   * notifications. Optional for backward compat with pre-v3-phase-B
   * docs — read-side helpers treat absence as "all reminders off".
   *
   * Categories:
   *   - dailyReminder: a fixed-time daily nudge to log expenses
   *   - budgetAlerts: fired when a tx pushes a budget over threshold
   *   - goalReminders: fired N days before a goal's target date
   */
  notifications?: {
    dailyReminder: boolean;
    /** 'HH:MM' 24-hour clock, defaults '20:00' (8pm). */
    dailyReminderTime: string;
    budgetAlerts: boolean;
    /** Fraction of limit at which an alert fires (0.8 = 80%). */
    budgetThreshold: 0.8 | 0.9 | 1.0;
    goalReminders: boolean;
  };
  createdAt: unknown;
  defaultWorkspaceId: string;
  workspaceIds: string[];
};

/**
 * Workspace doc — solo workspace per user in v1, future-proofed for shared
 * workspaces in v2.
 * Path: `workspaces/{wid}`. Solo workspace id is `solo-{uid}`.
 */
export type WorkspaceDoc = {
  id: string;
  ownerId: string;
  memberIds: string[];
  name: string;
  createdAt: unknown;
};

/**
 * Auth user view stored in client state. Mirror of the subset of the
 * `firebase/auth` `User` we expose to UI code, decoupled from the SDK type.
 */
export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

/**
 * Bilingual name shape used for category docs (and future budget / goal docs).
 * Mirrors the i18n locale shape so renderers do `name[i18n.language]` directly.
 * For user-created categories where the user only types one string, both keys
 * hold the same string.
 */
export type CategoryName = { id: string; en: string };

/**
 * Curated Lucide icon keys — string-literal union restricts what may be stored
 * on a Category doc. Resolution to a Lucide React component happens at render
 * time via `<CategoryIcon name={...}/>`.
 */
export type CategoryIcon =
  | 'utensils' | 'coffee' | 'shopping-cart' | 'pizza' | 'cookie'
  | 'car' | 'fuel' | 'train' | 'bike' | 'parking-circle'
  | 'zap' | 'droplet' | 'wifi' | 'phone' | 'tv' | 'heart-pulse'
  | 'shirt' | 'tv-2' | 'home' | 'sparkles'
  | 'film' | 'gamepad-2' | 'music' | 'plane'
  | 'stethoscope' | 'pill' | 'dumbbell'
  | 'book-open' | 'graduation-cap'
  | 'wallet' | 'gift' | 'briefcase' | 'trending-up'
  | 'coins' | 'landmark' | 'tag'
  // Added in T5 (ADR-06) for credit-card subtypes — same registry serves
  // both categories and accounts.
  | 'credit-card';

/**
 * Curated colour-key palette for categories. Resolution to hex (per
 * light/dark mode) happens at render time via the categoryColors map.
 */
export type CategoryColor =
  | 'red' | 'orange' | 'amber' | 'yellow'
  | 'green' | 'teal' | 'cyan' | 'blue'
  | 'indigo' | 'violet' | 'pink' | 'slate';

/**
 * Category document.
 * Path: `workspaces/{wid}/categories/{categoryId}`.
 *
 * Two-level hierarchy: `parentId === null` is a top-level group;
 * `parentId !== null` is a child of that group.
 *
 * Preset rows are seeded from `categoryPresets.ts` in the same batch as
 * `ensureUserDoc` (ADR-05 §2). Custom user rows are created via
 * `createCategory` from the /categories screen.
 *
 * Soft delete: `isArchived = true` hides from the default view but preserves
 * the doc id so transactions retain a stable reference.
 */
/**
 * 50/30/20 budget designation (ADR-21). Each leaf category gets
 * tagged as one of:
 *  - 'needs'   — essentials (rent, groceries, utilities, transport)
 *  - 'wants'   — discretionary (cafe, dining, entertainment, hobbies)
 *  - 'savings' — savings + investments + debt-paydown beyond minimums
 *  - null      — unassigned (legacy + user opt-out). Treated as 'wants'
 *                in 50/30/20 calculations to avoid disappearing
 *                spending; the user can re-tag from /categories.
 *
 * Only the `fifty_thirty_twenty` budget style consults this field.
 * `monthly_limit` and `envelope` ignore it entirely.
 */
export type BudgetGroup = 'needs' | 'wants' | 'savings';

export type Category = {
  id: string;
  parentId: string | null;
  name: CategoryName;
  icon: CategoryIcon;
  color: CategoryColor;
  isPreset: boolean;
  isArchived: boolean;
  order: number;
  /**
   * 50/30/20 group. Optional on the doc so legacy categories
   * (created before v2.0) read as null and the read layer treats
   * them as 'wants' for aggregation. New categories default to
   * the preset's `defaultBudgetGroup` at create time.
   */
  budgetGroup?: BudgetGroup | null;
  createdAt: unknown;
};

/**
 * ISO 4217 currency codes — the set Compass supports out of the box. v2
 * launches with a ten-currency menu covering IDR + the currencies most
 * commonly held by Indonesian residents (USD/SGD/EUR/AUD/JPY/GBP) plus
 * three regional neighbours (MYR/THB/CNY). Adding a new currency requires
 * extending this union AND adding metadata in `currencyMeta.ts` AND an FX
 * rate in `fxRates.ts` AND a translation key in `accounts.json`.
 *
 * `IDR` is the de-facto base currency throughout v2 (see comments on
 * `Transaction.amountIDR`). `users.baseCurrency` lets users choose USD as
 * their reporting baseline but v2.0 ships with IDR pinned — base-currency
 * switching lands in v2.1 alongside live FX fetches.
 */
export type Currency =
  | 'IDR' | 'USD' | 'SGD' | 'EUR' | 'AUD' | 'JPY' | 'GBP' | 'MYR' | 'THB' | 'CNY';

/**
 * Account types — top-level grouping for the accounts list (T5 / ADR-06).
 * Investment accounts (reksadana / saham / crypto) shipped in v3 phase A
 * with manual balance entry; live valuation deferred to v3.5.
 */
export type AccountType =
  | 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'investment';

/**
 * Curated account-subtype keys for the Indonesian audience. Mostly proper
 * nouns (BCA / Mandiri / GoPay / OVO etc) so display names live in i18n
 * and are largely identical between locales.
 *
 * Adding a new institution requires extending this union AND adding a
 * default icon in `accountSubtypes.ts` AND an i18n display name in both
 * `accounts.json` files.
 */
export type AccountSubtype =
  // cash
  | 'cash'
  // banks (top IDN + 'other' escape hatch)
  | 'bca' | 'mandiri' | 'bri' | 'bni' | 'cimb' | 'permata' | 'danamon'
  | 'btn' | 'bsi' | 'jago' | 'jenius' | 'blu' | 'seabank' | 'bank_other'
  // e-wallets
  | 'gopay' | 'ovo' | 'dana' | 'shopeepay' | 'linkaja' | 'doku' | 'ewallet_other'
  // credit cards
  | 'visa' | 'mastercard' | 'jcb' | 'amex' | 'card_other'
  // investments (v3 phase A)
  | 'reksadana' | 'saham' | 'crypto' | 'investment_other';

/**
 * Account document.
 * Path: `workspaces/{wid}/accounts/{accountId}`.
 *
 * `currentBalance` is denormalised — only mutated via accountsService
 * (T6 transactions atomically update it alongside transaction writes).
 * `initialBalance` is the create-time snapshot, never mutated.
 *
 * Reuses `CategoryIcon` + `CategoryColor` from the curated registries —
 * the same icon/colour vocabulary serves both categories and accounts.
 */
export type Account = {
  id: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  /**
   * Account currency. v1 was pinned to 'IDR'; v2 (multi-currency) widens
   * to the {@link Currency} union. `currentBalance` is denormalised in
   * THIS currency — it is NOT pre-converted to IDR. Cross-currency
   * aggregation (Dashboard net worth) converts at read time via
   * `convertToIDRMinor`. Existing accounts with no `currency` field
   * (created before v2) are treated as IDR by the read layer.
   */
  currency: Currency;
  currentBalance: number;
  initialBalance: number;
  includedInNetWorth: boolean;
  isArchived: boolean;
  icon: CategoryIcon;
  color: CategoryColor;
  order: number;
  createdAt: unknown;
  updatedAt: unknown;
};

/**
 * Transaction type — expense reduces an account, income increases it,
 * transfer moves between two accounts (no category).
 */
export type TransactionType = 'expense' | 'income' | 'transfer';

/**
 * One leg of a transaction's category attribution. v1 always writes
 * `splits.length === 1` (one category for the whole transaction); v2 will
 * support multi-split (e.g. a Tokopedia order split across Pakaian +
 * Elektronik). For transfers, `splits = []` — transfers don't belong to a
 * category.
 *
 * Invariant: ∑ splits[i].amount === transaction.amount when splits non-empty.
 */
export type Split = {
  categoryId: string;
  amount: number;  // integer minor units
};

/**
 * Transaction document.
 * Path: `workspaces/{wid}/transactions/{txId}`.
 *
 * Always written atomically with associated balance + monthly-total updates
 * via `transactionsService.createTransaction` (ADR-07 §2). Never write a
 * transaction doc directly without going through the service.
 *
 * `yearMonth` is denormalised so monthly views (dashboard, budgets) can
 * filter by `where('yearMonth', '==', '2026-05')` without index gymnastics.
 */
export type Transaction = {
  id: string;
  type: TransactionType;
  date: string;          // 'YYYY-MM-DD' day grain in v1
  yearMonth: string;     // 'YYYY-MM' denormalised
  accountId: string;     // for expense/income: source/sink. For transfer: from-account.
  toAccountId: string | null;  // transfer only — destination account
  /**
   * Transaction currency — denormalised from the source account at
   * write-time. v1 always 'IDR'; v2 widens to the full {@link Currency}
   * union. Stored on the tx so that historical reports remain valid
   * even if the user later changes the account's currency (which v2
   * does not yet permit — but the field is correct either way).
   */
  currency: Currency;
  amount: number;        // integer minor units in `currency`
  /**
   * IDR-denominated equivalent at the FX rate used at write-time.
   * Used by every cross-account aggregation (dashboard net worth,
   * monthly totals, budgets, reports, insights). For IDR-currency
   * transactions, `amountIDR === amount`. For non-IDR, computed via
   * `convertToIDRMinor` and stored so the FX snapshot doesn't drift
   * even when rates update later.
   */
  amountIDR: number;
  splits: Split[];       // length 1 in v1; [] for transfers
  /**
   * OPTIONAL admin/transfer fee in `currency` minor units. Transfer-only.
   * When present, the source account's balance is reduced by
   * `amount + feeMinor` (the fee is gone — typical bank/wallet
   * transfer charge). The destination account still receives `amount`
   * unchanged.
   *
   * Stored on the tx so the user can see it on the detail screen and
   * future reports can sum total fees paid. Not part of the
   * `category_month_totals` rollup — fees are inherent transfer
   * overhead, not categorisable spend in v1.
   *
   * Undefined or 0 for fee-less transfers (the common case for
   * intra-bank transfers, e-wallet top-ups, etc.).
   */
  feeMinor?: number;
  /** IDR-converted fee at the same FX snapshot as `amountIDR`. */
  feeIDR?: number;
  description: string;
  /**
   * Free-text user tags (v2 / ADR-17). Always present, default `[]`.
   * Tags are normalised to lower-case at write time (`grab`, not `Grab`)
   * so case differences don't fragment the global tag list. Used for
   * cross-cutting categorisation that sits orthogonal to the
   * category tree — e.g. `lebaran-2027`, `split-with-andy`,
   * `business-trip`. Cap of ~10 tags per tx is enforced by the UI;
   * the service has no hard limit.
   */
  tags: string[];
  source: 'manual' | 'nlp';
  rawInput: string | null;
  confidence: number | null;
  createdAt: unknown;
  updatedAt: unknown;
};

/**
 * Per-category, per-month rollup. Doc id is deterministic
 * (`${yearMonth}_${categoryId}`) so the transactions service can `setDoc`
 * with `merge: true` + `increment()` in the same batch as a transaction
 * write — no read-modify-write race.
 *
 * Path: `workspaces/{wid}/category_month_totals/{yearMonth}_{categoryId}`.
 *
 * Tracks expense rollup ONLY. Income transactions don't roll up here —
 * dashboard income totals (T8) come from a separate query path.
 */
export type CategoryMonthTotal = {
  categoryId: string;
  yearMonth: string;
  totalIDR: number;     // integer minor units
  txCount: number;
  updatedAt: unknown;
};

/**
 * Goal kind — v2 launch ships `sinking_fund` only; `habit_streak` is a
 * v2.5 placeholder so the schema doesn't need migration when habits land.
 */
export type GoalKind = 'sinking_fund' | 'habit_streak';

/**
 * Goal document (v2 / ADR-15). Sinking funds are user-named savings
 * targets with a target amount + optional target date. Contributions
 * are tracked manually (user types an amount; we increment
 * currentMinor). Tx-linked contributions are v2.5.
 *
 * Path: `workspaces/{wid}/goals/{id}`.
 *
 * v2.5 forward-compat: habit-streak fields will land here when habits
 * ship — no migration needed.
 */
export type Goal = {
  id: string;
  kind: GoalKind;
  name: string;
  // Sinking-fund fields
  targetMinor: number;
  currentMinor: number;
  /** 'YYYY-MM-DD' or null for no deadline. */
  targetDate: string | null;
  /** Matches a key in shared/data/goalTemplates.ts; null for custom goals. */
  templateKey: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};

/**
 * Saved filter preset (v2 / ADR-18). Captures a snapshot of the
 * /transactions filter state so users can re-apply common queries
 * with a single tap (e.g. "Cafe expenses this month", "Anything
 * tagged bandung-trip"). Persisted per-workspace; shared across
 * devices via the existing Firestore subscription.
 *
 * Path: `workspaces/{wid}/saved_filters/{id}`.
 */
export type SavedFilter = {
  id: string;
  name: string;
  /** Free-text search substring — matches Transaction.description. */
  search: string;
  /** 'all' or one of the TransactionType values. */
  typeFilter: 'all' | TransactionType;
  /**
   * Date filter bucket. v3 widened to add 3 mid-range presets +
   * 'custom' for arbitrary from-to via DateField pickers. Legacy v1/v2
   * presets storing the original 3-value union still resolve fine —
   * the new keys are additive.
   */
  dateFilter:
    | 'this_month' | 'last_month' | 'last_3_months'
    | 'this_year' | 'last_year' | 'all_time' | 'custom';
  /** Custom range bounds (inclusive 'YYYY-MM-DD'). Set only when
   *  `dateFilter === 'custom'`. */
  customFrom?: string | null;
  customTo?: string | null;
  /** Tags applied (ANY-match semantics, mirrors the live tag filter). */
  tagFilter: string[];
  /**
   * Category ids applied (v3 phase A — 5). ANY-match semantics: a tx is
   * kept if ANY of its splits' categoryId matches one of the listed ids.
   * Empty array = no category constraint. Optional for legacy v2 docs
   * that didn't carry the field — service read normaliser defaults to [].
   */
  categoryFilter?: string[];
  /**
   * Account ids applied (v3 phase A — 5). ANY-match semantics: a tx is
   * kept if its `accountId` (or `toAccountId` for transfers) matches
   * one of the listed ids. Empty array = no account constraint.
   */
  accountFilter?: string[];
  createdAt: unknown;
};

/**
 * Budget style — v1 ships only `monthly_limit`; envelope + 50/30/20 are
 * schema-forward placeholders so v2 can reuse the Budget doc shape without
 * a migration.
 */
export type BudgetStyle = 'monthly_limit' | 'envelope' | 'fifty_thirty_twenty';

/**
 * Rollover policy — what happens to an unused or over-spent budget at
 * month boundary. v1 always 'none' (each month resets fresh). 'carry_over'
 * + 'reset' are placeholders for v2 envelope.
 */
export type RolloverPolicy = 'none' | 'carry_over' | 'reset';

/**
 * Per-category, per-month budget limit. Doc id mirrors `CategoryMonthTotal`
 * (`${yearMonth}_${categoryId}`) so the join in the budgets screen is a
 * trivial Map.get on the same key — no aggregation queries.
 *
 * Path: `workspaces/{wid}/budgets/{yearMonth}_{categoryId}`.
 *
 * v1 invariants:
 * - `style === 'monthly_limit'`
 * - `rolloverPolicy === 'none'`
 *
 * Both fields stay on the doc so v2 envelope budgets can land without a
 * schema migration.
 */
export type Budget = {
  id: string;
  yearMonth: string;        // 'YYYY-MM'
  categoryId: string;
  style: BudgetStyle;       // v1 always 'monthly_limit'
  limitMinor: number;       // integer minor units (×100)
  rolloverPolicy: RolloverPolicy;  // v1 always 'none'
  createdAt: unknown;
  updatedAt: unknown;
};
