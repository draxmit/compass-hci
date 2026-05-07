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
  budgetStyle: 'monthly_limit' | 'envelope';
  biometricEnabled: boolean;
  fcmTokens: string[];
  onboardingComplete: boolean;
  /**
   * Free-text goal the user enters in the onboarding wizard's first step
   * ("what are you saving for?"). T10 (ADR-11). Rendered as the goal pill
   * on Dashboard. `null` until step 1 completes; if the user skips the
   * step, stays `null` and the pill is hidden. v2 will migrate to a
   * `goals/` sub-collection when sinking funds + habits + templates land.
   */
  primaryGoal: string | null;
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
export type Category = {
  id: string;
  parentId: string | null;
  name: CategoryName;
  icon: CategoryIcon;
  color: CategoryColor;
  isPreset: boolean;
  isArchived: boolean;
  order: number;
  createdAt: unknown;
};

/**
 * Account types — top-level grouping for the accounts list (T5 / ADR-06).
 * Investment accounts are out of scope for v1; landing in v3.
 */
export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit_card';

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
  | 'visa' | 'mastercard' | 'jcb' | 'amex' | 'card_other';

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
  currency: 'IDR';
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
  currency: 'IDR';
  amount: number;        // integer minor units
  amountIDR: number;     // == amount in v1; v2 multi-currency uses FX snapshot
  splits: Split[];       // length 1 in v1; [] for transfers
  description: string;
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
