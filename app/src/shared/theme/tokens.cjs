// Source of truth for design tokens. CommonJS so tailwind.config.js can require()
// Theme: "Dark Mercury × Raycast" (ADR-02).
// Dark primary, light optional. No glass blur in v1 (cards are flat with hairline
// borders). Aurora 4 colors retained as PER-PAGE accents (Dashboard violet,
// Transactions cyan, Budgets amber, Insights magenta), not as a rotating gradient.

module.exports = {
  // Page-specific accent colors. Used by PageBackdrop (radial gradient glows),
  // active tab/sidebar item indicators, focus rings, chart strokes.
  accent: {
    dashboard:    '#6366f1', // violet
    transactions: '#06b6d4', // cyan
    budgets:      '#f59e0b', // amber
    insights:     '#ec4899', // magenta
    neutral:      '#ffffff', // for More / Settings — no color identity
  },

  // Surface tokens. Light + dark variants resolved at runtime by ThemeProvider.
  surface: {
    'light-bg':       '#fafafa',
    'light-fg':       '#0a0a0a',
    'light-fg-muted': 'rgba(10,10,10,0.60)',
    'light-fg-faint': 'rgba(10,10,10,0.40)',
    'light-border':   'rgba(10,10,10,0.10)',
    'light-card':     'rgba(10,10,10,0.03)',
    'light-input':    'rgba(10,10,10,0.04)',
    'dark-bg':        '#0a0a0a',
    'dark-fg':        '#ffffff',
    'dark-fg-muted':  'rgba(255,255,255,0.60)',
    'dark-fg-faint':  'rgba(255,255,255,0.40)',
    'dark-border':    'rgba(255,255,255,0.10)',
    'dark-card':      'rgba(255,255,255,0.04)',
    'dark-input':     'rgba(255,255,255,0.04)',
  },

  // Semantic colors — for income/expense, warnings, alerts.
  semantic: {
    warning:  '#f59e0b',
    danger:   '#f43f5e',
    positive: '#10b981',
  },

  radius: {
    'sm':  '8px',
    'md':  '12px',
    'lg':  '20px',
    'xl':  '24px',
    '2xl': '28px',
    '3xl': '36px',
  },

  // Spacing scale extension (4px grid). Spacious density per ADR-02.
  spacing: {
    '18': '72px',
    '22': '88px',
  },
};
