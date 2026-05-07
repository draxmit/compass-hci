// Source of truth for design tokens. CommonJS so tailwind.config.js can require()
// Theme: "Dark Mercury × Raycast" (ADR-02).
// Dark primary, light optional. No glass blur in v1 (cards are flat with hairline
// borders).
//
// v3: per-tab accents (Dashboard violet, Transactions cyan, Budgets amber,
// Insights magenta) UNIFIED into one brand emerald (#059669) per user feedback —
// "one main color theme, free to differentiate for any visual or category
// differentiation". The four tab keys are kept on the same value rather than
// collapsed to one so existing call sites and the PageBackdrop accent-transition
// system stay byte-for-byte compatible — every transition is now a no-op fade
// between identical colours, costing nothing.
//
// Hue isolation:
//   - brand emerald `#059669` — primary CTAs, active tab indicators, chart
//     strokes, focus rings.
//   - semantic positive `#10b981` (emerald-500) — slightly lighter, reserved
//     for delta-up indicators ("↑ Rp 200K more"). Different saturation reads
//     as a different role even though both are emerald-family.
//   - category green `#16a34a` (Tailwind green-600) — pure grass green, used
//     only as one of 12 category-icon tints. Different hue family from
//     emerald, so a green-categorised tx and a primary CTA on the same screen
//     don't visually collide.

module.exports = {
  // Brand accent. Single emerald across the whole app. Used by PageBackdrop
  // (radial gradient glows), active tab/sidebar item indicators, focus rings,
  // chart strokes. Per-tab keys retained for backward-compat — they all now
  // resolve to the same colour.
  accent: {
    dashboard:    '#059669', // emerald-600 (unified brand)
    transactions: '#059669',
    budgets:      '#059669',
    insights:     '#059669',
    neutral:      '#ffffff', // for More / Settings — no brand identity
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
