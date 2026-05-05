// Typed re-export of design tokens. CommonJS source lives in tokens.cjs so
// tailwind.config.js can require() it. App code imports from here.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokensRaw = require('./tokens.cjs') as Tokens;

export type Tokens = {
  accent: {
    dashboard: string;
    transactions: string;
    budgets: string;
    insights: string;
    neutral: string;
  };
  surface: {
    'light-bg': string;
    'light-fg': string;
    'light-fg-muted': string;
    'light-fg-faint': string;
    'light-border': string;
    'light-card': string;
    'light-input': string;
    'dark-bg': string;
    'dark-fg': string;
    'dark-fg-muted': string;
    'dark-fg-faint': string;
    'dark-border': string;
    'dark-card': string;
    'dark-input': string;
  };
  semantic: {
    warning: string;
    danger: string;
    positive: string;
  };
  radius: Record<'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl', string>;
  spacing: Record<'18' | '22', string>;
};

export const tokens: Tokens = tokensRaw;

export type AccentKey = keyof Tokens['accent'];
