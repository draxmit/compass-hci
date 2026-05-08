/**
 * App-side mirror of the Worker's HTTP contract types
 * (`packages/gemini-worker/src/types.ts`). Kept as a local copy rather
 * than imported from the Worker package so the Worker can be deployed
 * + maintained independently from the app's Metro bundler graph.
 *
 * **Keep these in sync** with the Worker types — if you add an action
 * type or change a field, update both files.
 */

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  /** epoch milliseconds */
  ts: number;
  actions?: SuggestedAction[];
};

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

export type ChatContext = {
  locale: 'id' | 'en';
  today: string;
  totalBalanceMinor: number;
  accounts: ContextAccount[];
  budgets: ContextBudget[];
  goals: ContextGoal[];
  transactions: ContextTransaction[];
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

export type ChatResponse = {
  reply: ChatMessage;
  history: ChatMessage[];
};
