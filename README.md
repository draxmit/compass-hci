# compass-hci

**Compass** — Indonesian-first personal finance tracker. Bilingual (Bahasa Indonesia / English), cross-platform (Web + Android APK + iOS PWA), shipped on a $0 stack.

Built as a Human-Computer Interaction class project (AOL HCI Lec).

---

## Try it

### 🌐 Web (any device, any OS)

Open in your browser:

> **<https://compass-app-7a751.web.app/>**

Works on desktop, mobile browsers, and tablets. Sign in with Google or create an email account.

### 📱 Android (standalone APK)

Download and install:

> **<https://expo.dev/accounts/draxmit/projects/compass/builds/fb5feea3-fee9-4704-840c-241dfcb3da61>**

On your Android device:
1. Tap the link above → "Install"
2. If prompted, enable "Install unknown apps" for your browser/file manager
3. Open Compass — works fully offline-friendly with cloud sync

### 🍎 iOS (PWA)

iOS uses the web app installed to your home screen:
1. Open the web URL above in **Safari**
2. Tap the **Share** button → **"Add to Home Screen"**
3. Compass appears as a regular app icon and launches in fullscreen

### Demo account (skip the sign-up)

```
Email:    demo@compass.app
Password: compass2026
```

The demo workspace is pre-populated with multiple accounts (BCA / GoPay / Tunai / Mandiri Card / USD Savings / Reksa Dana), ~200 transactions across 6 months, recurring subscriptions, savings goals, budgets, and quick-add presets — enough to showcase every feature without manual setup.

---

## Features

- **Multi-account tracking** — bank, e-wallet, credit card, cash, investment, in any of 10 currencies (IDR primary)
- **Transactions** — manual entry, NLP quick-entry ("nongki di Starbucks 65rb pakai gopay"), voice input, receipt OCR via camera, AI-suggested categories, multi-category splits, transfer fees
- **Budgets** — three styles: Monthly Limit, Envelope (with rollover), 50/30/20
- **Insights** — 6-month trend, anomaly detection, spending heatmap, weekday patterns, recurring-expense detector, category donut chart, budget health pill
- **Goals** — sinking funds and habit tracking with milestone celebrations and pinning
- **Reports** — monthly summary screen with Word/PDF export
- **Ask Compass** — Gemini-powered conversational chat over your finances ("how much did I spend on coffee last month?")
- **Onboarding wizard** — 4 steps: pick a goal, pick a budget style, add first account, set first budget
- **Quick-add presets** — long-press the FAB for one-tap transaction entry
- **Settings** — light/dark/auto theme, ID/EN switcher, IDR-everywhere display toggle, biometric app lock, daily reminders, budget alerts, goal deadline reminders, account deletion
- **Multi-currency** — live FX rates with 24h cache + offline fallback snapshot

---

## Tech stack

| Layer | Tech |
|---|---|
| App | Expo SDK 54, Expo Router 6, React Native 0.81, React 19, NativeWind 4 (Tailwind 3) |
| State | Zustand |
| Backend | Firebase (Auth + Firestore, Spark plan), Cloudflare Worker for Gemini proxy |
| AI | Google Gemini 2.0 Flash (chat, NLP parse, OCR) |
| Native modules | `@react-native-google-signin/google-signin`, `expo-camera` + `@react-native-ml-kit/text-recognition` (OCR), `expo-speech-recognition`, `expo-local-authentication`, `expo-notifications` |
| Distribution | Firebase Hosting (web), EAS Build (Android APK), iOS via PWA |

---

## Documentation

All documentation lives in `docs/`:

| Document | Files |
|---|---|
| Technical Documentation | `docs/tech-doc.{en,id}.md` |
| User Guide | `docs/user-guide.{en,id}.md` |
| HCI Heuristic Evaluation | `docs/hci/heuristic-evaluation.{en,id}.md` |
| Persona | `docs/hci/persona.{en,id}.md` |
| Journey Map | `docs/hci/journey-map.{en,id}.md` |
| Wireframes | `docs/hci/wireframes.md` |
| ERD | `docs/architecture/data-model.md` |
| System Architecture | `docs/architecture/system-architecture.md` |
| Sequence Diagrams | `docs/architecture/sequences/{log-transaction,sign-in,budget-progress-update}.md` |
| Architecture Decision Records | `docs/decisions/ADR-01..24.md` |
| Per-task change history | `docs/changes/T1-summary.md` … `T11-summary.md` |
| Chronological merge log | `docs/CHANGELOG.md` |

DOCX exports of the user-facing docs (tech doc, user guide, HCI eval, persona, journey map) are also available alongside their markdown sources after running `pnpm docs:export` (see "Generating DOCX + diagrams" below).

---

## Local development

### Prerequisites

- **Node.js 20+**
- **pnpm 9** — `corepack enable` then `corepack prepare pnpm@9.12.0 --activate`
- For Android dev: Android Studio + Java JDK 17
- A Firebase project (Spark plan; free; no credit card)

### Setup

```bash
git clone https://github.com/draxmit/compass-hci.git
cd compass-hci
pnpm install

# Wire your Firebase project
cp app/.env.example app/.env.local
# Fill in EXPO_PUBLIC_FIREBASE_* with values from your Firebase Console
# (Project Settings → General → Your apps → Web app → Config object)

# (Optional) seed the demo account so you can sign in immediately
pnpm seed:demo
```

See `docs/tech-doc.en.md` § "Firebase setup" for a step-by-step Firebase Console walkthrough.

### Run

```bash
pnpm app:web         # Expo web on http://localhost:8081
pnpm app:android     # Android emulator (requires AVD running)
pnpm app:dev         # Expo dev client on a real device (scan QR)
pnpm app:typecheck   # tsc --noEmit
pnpm app:lint        # ESLint
```

### Build + deploy

| Target | Command | Notes |
|---|---|---|
| Web (deploy to Firebase Hosting) | `cd app && pnpm deploy:web` | $0; ~3 min |
| Android APK (sideload) | `cd app && pnpm build:apk` | $0; 10–30 min EAS cloud build |
| iOS PWA | The deployed web URL → Safari → "Add to Home Screen" | $0; no Apple Developer fee |
| Android Play Store | `eas build -p android --profile production` | Optional **$25 one-time** Play Console fee |
| iOS TestFlight | `eas build -p ios --profile preview` | Optional **$99/yr** Apple Developer fee |

### Generating DOCX + diagrams

For class submission, the markdown sources can be converted to DOCX (via [pandoc](https://pandoc.org/)) and Mermaid diagrams to PNG (via [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli)):

```bash
# One-off DOCX conversion
pandoc docs/tech-doc.en.md -o tech-doc-EN.docx
pandoc docs/tech-doc.id.md -o tech-doc-ID.docx
pandoc docs/user-guide.en.md -o user-guide-EN.docx
pandoc docs/user-guide.id.md -o user-guide-ID.docx
pandoc docs/hci/heuristic-evaluation.en.md -o heuristic-evaluation-EN.docx
pandoc docs/hci/heuristic-evaluation.id.md -o heuristic-evaluation-ID.docx
pandoc docs/hci/persona.en.md -o persona-EN.docx
pandoc docs/hci/persona.id.md -o persona-ID.docx
pandoc docs/hci/journey-map.en.md -o journey-map-EN.docx
pandoc docs/hci/journey-map.id.md -o journey-map-ID.docx

# Render Mermaid diagrams to PNG
mmdc -i docs/architecture/data-model.md -o data-model.png
mmdc -i docs/architecture/system-architecture.md -o system-architecture.png
mmdc -i docs/architecture/sequences/log-transaction.md -o seq-log-transaction.png
mmdc -i docs/architecture/sequences/sign-in.md -o seq-sign-in.png
mmdc -i docs/architecture/sequences/budget-progress-update.md -o seq-budget-progress-update.png
```

---

## Monorepo layout

```
compass-hci/
  app/                            # Expo Universal app (SDK 54, Router 6, RN 0.81 + RN Web)
    app/                          # Expo Router file routes
    src/
      features/                   # Feature-sliced code
      services/                   # firestore/* + firebase/*
      shared/                     # ui/, theme/, hooks/, utils/, data/, i18n/
      stores/                     # Zustand stores
    locales/{id,en}/*.json        # 13 i18n namespaces × 2 locales
    assets/                       # icon, adaptive-icon, favicon, splash
  packages/
    shared-types/                 # Cross-package TypeScript models
    gemini-worker/                # Cloudflare Worker — proxies chat to Gemini
  scripts/
    seed-demo.mjs                 # Demo-data seeder
    generate-icons.mjs            # Brand icon generator (SVG → PNG)
  docs/                           # Class deliverables (see Documentation section)
  legacy/                         # Archived Vite prototype (reference only)
  firestore.rules                 # Owner-only access via auth.uid
```

---

## Cost stance

**$0 through every shipped phase.** Firebase Spark plan, EAS free tier, Cloudflare Workers free tier, no credit card on file. Optional paid paths (Play Store $25, Apple Developer $99/yr) are flagged but never required for the class submission.

---

## License

MIT.
