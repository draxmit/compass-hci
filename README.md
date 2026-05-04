# Compass

Personal money management app for Indonesian users. Bilingual (Bahasa/English),
cross-platform (Web + Android APK + iOS PWA), zero-cost stack.

## Monorepo layout

```
compass/
  app/                   # Expo Universal app (SDK 54, Router 6, RN 0.81, RN Web)
  packages/shared-types/ # Cross-package TypeScript models
  legacy/                # Archived Vite prototype (read-only reference)
  docs/                  # ADRs, change logs, HCI artifacts, design system
  .claude/               # Orchestrator memory + agent prompts
```

## Prerequisites

- Node.js 20+
- pnpm 9 (`corepack enable` then `corepack prepare pnpm@9.12.0 --activate`)
- For Android: Android Studio + Java JDK 17

## Setup

```bash
pnpm install
```

## Run

```bash
pnpm app:web        # Expo web on localhost
pnpm app:android    # Android emulator (requires AVD running)
pnpm app:dev        # Expo Go on real device (scan QR)
pnpm app:typecheck  # tsc --noEmit
pnpm app:lint       # ESLint
```

## Legacy prototype

The original Vite-React prototype lives at `legacy/` for reference. See
`legacy/README.md` for the original notes. Visual aesthetic and the NLP parser
are being ported into `app/`; nothing else is reused.
