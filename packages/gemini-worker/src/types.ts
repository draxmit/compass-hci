/**
 * Public API contract between the Compass app and this Worker.
 *
 * The Worker has NO Firestore credentials and cannot read user data on
 * its own. Each chat request from the app includes a fresh `ChatContext`
 * snapshot built client-side from existing Firestore subscriptions.
 * Worker forwards this verbatim to Gemini in the system prompt; nothing
 * about the user's data is persisted on Worker (history KV holds chat
 * turns only, not transactions).
 */

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** epoch milliseconds */
  ts: number;
  /** Optional structured action cards alongside the assistant's text. */
  actions?: SuggestedAction[];
};

/**
 * Structured actions Gemini may return alongside text. Each renders as
 * a tappable pill below the assistant message in the app; tap → deep-
 * links to a pre-filled trusted screen. NEVER auto-executed.
 */
export type SuggestedAction =
  | {
      type: 'createBudget';
      label: string;
      categoryId: string;
      amountMinor: number;
    }
  | {
      type: 'viewTransactions';
      label: string;
      filter: {
        categoryId?: string;
        dateRange?: 'thisMonth' | 'lastMonth' | 'last7d' | 'last30d';
      };
    }
  | {
      type: 'navigate';
      label: string;
      target: string;
    };

/** Snapshot the app sends with each chat request. */
export type ChatContext = {
  locale: 'id' | 'en';
  /** 'YYYY-MM-DD' */
  today: string;
  totalBalanceMinor: number;
  accounts: ContextAccount[];
  budgets: ContextBudget[];
  goals: ContextGoal[];
  /** Last 90 days of transactions. */
  transactions: ContextTransaction[];
  /** Aggregated rollups (last 90 days) so Gemini doesn't have to do the arithmetic. */
  categoryTotals90d: ContextCategoryTotal[];
};

export type ContextAccount = {
  id: string;
  name: string;
  type: string;
  subtype: string;
  balanceMinor: number;
  currency: string;
};

export type ContextBudget = {
  categoryId: string;
  categoryName: string;
  limitMinor: number;
  spentMinor: number;
};

export type ContextGoal = {
  id: string;
  name: string;
  targetMinor: number;
  currentMinor: number;
  targetDate: string | null;
  isPinned: boolean;
};

export type ContextTransaction = {
  id: string;
  type: 'expense' | 'income' | 'transfer';
  date: string;
  amountMinor: number;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  accountName: string;
  description: string;
  tags: string[];
};

export type ContextCategoryTotal = {
  categoryId: string;
  categoryName: string;
  totalSpentMinor: number;
  count: number;
};

export type ChatRequest = {
  /** Latest user message — Worker appends to history before calling Gemini. */
  userMessage: string;
  context: ChatContext;
};

export type ChatResponse = {
  /** Assistant's reply with optional action cards. */
  reply: ChatMessage;
  /** Updated history (last 10 turns, capped). */
  history: ChatMessage[];
};

/**
 * Parsed transaction fields. Matches the existing `nlpParser` return
 * shape (modulo amountMinor naming) so the entry form can swap
 * between native parsing and Gemini parsing without UI changes.
 *
 * Each field is optional + has a confidence score [0..1]. Low
 * confidence (< 0.5) means the LLM was guessing; the form will
 * pre-fill it but flag it visually for user review.
 */
export type ParsedTransactionFields = {
  type?: 'expense' | 'income' | 'transfer';
  amountMinor?: number;
  merchant?: string;
  description?: string;
  date?: string; // 'YYYY-MM-DD'
  categoryId?: string;
  accountId?: string;
  toAccountId?: string;
  /** Overall match confidence [0..1] — averaged across the populated fields. */
  confidence: number;
};

/** POST /parse-text — Gemini-powered NLP for transaction free-text. */
export type ParseTextRequest = {
  text: string;
  context: ChatContext;
};

export type ParseTextResponse = {
  parsed: ParsedTransactionFields;
  /** The text we received back (for debugging — usually echoes input). */
  echoText: string;
};

/** POST /scan-receipt — Gemini multimodal vision for receipt extraction. */
export type ScanReceiptRequest = {
  /** Base64-encoded image bytes (no data: prefix). */
  imageBase64: string;
  /** MIME type — typically 'image/jpeg' from expo-camera capture. */
  mimeType: string;
  context: ChatContext;
};

export type ScanReceiptResponse = {
  parsed: ParsedTransactionFields;
  /**
   * Raw text Gemini extracted from the receipt — surfaced in dev/debug
   * for sanity-checking and useful as a description fallback.
   */
  rawText: string;
};

export type WorkerEnv = {
  FIREBASE_PROJECT_ID: string;
  GEMINI_API_KEY: string;
  HISTORY: KVNamespace;
};
