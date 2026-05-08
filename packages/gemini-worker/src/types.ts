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

export type WorkerEnv = {
  FIREBASE_PROJECT_ID: string;
  GEMINI_API_KEY: string;
  HISTORY: KVNamespace;
};
