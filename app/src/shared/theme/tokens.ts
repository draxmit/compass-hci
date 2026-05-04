// TypeScript wrapper around tokens.cjs so app code can `import { tokens } from '@/shared/theme/tokens'`.
// Tailwind config (CommonJS) reads tokens.cjs directly; this module re-exports the same object
// so we have a single source of truth without duplication.
//
// Use this for inline styles where NativeWind classes can't reach (e.g. LinearGradient color arrays).

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tokensRaw = require('./tokens.cjs') as Tokens;

export type Tokens = {
  aurora: {
    violet: string;
    cyan: string;
    magenta: string;
    amber: string;
  };
  surface: {
    'light-bg': string;
    'light-fg': string;
    'light-fg-muted': string;
    'light-fg-faint': string;
    'light-border': string;
    'dark-bg': string;
    'dark-fg': string;
    'dark-fg-muted': string;
    'dark-fg-faint': string;
    'dark-border': string;
  };
  semantic: {
    warning: string;
    danger: string;
    positive: string;
  };
  glass: {
    'subtle-light': string;
    'subtle-dark': string;
    'strong-light': string;
    'strong-dark': string;
  };
  radius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
  };
  shadow: {
    'glass-light': string;
    'glass-dark': string;
  };
};

export const tokens: Tokens = tokensRaw;
