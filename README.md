# Compass

Personal money management app for Indonesian users. Bilingual (Bahasa Indonesia / English), cross-platform (Web + Android APK + iOS PWA), **$0 stack — no credit card required at any phase**.

Built as a Human-Computer Interaction class project. v1 ships T1..T11 (auth + accounts + categories + transactions + budgets + monthly report + onboarding wizard + settings + delete-account).

---

## Demo

A pre-populated demo account is available against the deployed Firebase project:

```
Email:    demo@compass.app
Password: compass2026
```

Re-seed the demo data (wipes + reseeds; idempotent) with:

```bash
pnpm seed:demo
```

The demo workspace contains 4 accounts (BCA / GoPay / Tunai / Mandiri Card), ~95 transactions across 3 months, and 6 budgets sized to show under / near-limit / over-budget states.

---

## Monorepo layout

```
compass/
  app/                            # Expo Universal app (SDK 54, Router 6, RN 0.81 + RN Web)
    app/                          # Expo Router file routes
    src/
      features/                   # Feature-sliced code (currently: onboarding)
      services/                   # firestore/* + firebase/*
      shared/                     # ui/, theme/, hooks/, utils/, data/, i18n/
      stores/                     # Zustand stores
    locales/{id,en}/*.json        # 10 i18n namespaces × 2 locales
  packages/shared-types/          # Cross-package TypeScript models
  scripts/seed-demo.mjs           # Demo-data seeder (Web SDK; no Admin SDK needed)
  legacy/                         # Archived Vite prototype (read-only reference)
  docs/
    architecture/                 # ERD + system architecture + sequence diagrams
    decisions/                    # ADR-01..12
    changes/                      # T1-summary..T11-summary
    hci/                          # persona, journey map, heuristic eval, wireframes
    tech-doc.{en,id}.md           # Technical documentation
    user-guide.{en,id}.md         # End-user walkthrough
    CHANGELOG.md
  .claude/                        # Orchestrator memory + ADR-creation agent prompts
  firestore.rules                 # Owner-only access via auth.uid
```

---

## Prerequisites

- **Node.js 20+**
- **pnpm 9** — `corepack enable` then `corepack prepare pnpm@9.12.0 --activate`
- For Android: Android Studio + Java JDK 17
- Firebase project (Spark plan; free; no credit card)

---

## Setup

```bash
git clone <repo>
cd compass
pnpm install

# Wire your Firebase project
cp app/.env.example app/.env.local
# Fill in EXPO_PUBLIC_FIREBASE_* with the values from your project's Firebase console
# (Project Settings → General → Your apps → Web app → Config object)

# (Optional) seed the demo account so you can sign in immediately
pnpm seed:demo
```

See `docs/tech-doc.en.md` § "Firebase setup" for step-by-step Firebase console walkthrough.

---

## Run

```bash
pnpm app:web         # Expo web on http://localhost:8081
pnpm app:android     # Android emulator (requires AVD running)
pnpm app:dev         # Expo Go on a real device (scan QR)
pnpm app:typecheck   # tsc --noEmit
pnpm app:lint        # ESLint
```

---

## Build + distribute

| Target | Command | Notes |
|---|---|---|
| Web | `pnpm --filter ./app exec expo export --platform web` then `firebase deploy --only hosting` | $0 |
| Android APK (sideload) | `cd app && eas build -p android --profile preview` | $0; ~15 min cloud build |
| Android Play Store | `eas build -p android --profile production` | **$25 one-time** Google Play Console fee — deferred from v1 |
| iOS PWA | The deployed web URL — install via Safari → Share → "Add to Home Screen" | $0; no Apple Developer fee |
| iOS TestFlight | `eas build -p ios --profile preview` | **$99/yr** Apple Developer Program — deferred from v1 |

---

## Class deliverables

All deliverables in `docs/`:

| Deliverable | Files |
|---|---|
| Technical Documentation | `tech-doc.en.md`, `tech-doc.id.md` |
| User Guide | `user-guide.en.md`, `user-guide.id.md` |
| HCI Heuristic Evaluation | `hci/heuristic-evaluation.{en,id}.md` |
| Persona | `hci/persona.{en,id}.md` |
| Journey Map | `hci/journey-map.{en,id}.md` |
| Wireframes (screen inventory) | `hci/wireframes.md` |
| ERD | `architecture/data-model.md` |
| System Architecture Diagram | `architecture/system-architecture.md` |
| Sequence Diagrams | `architecture/sequences/{log-transaction,sign-in,budget-progress-update}.md` |
| ADRs (architectural decisions, 12 total) | `decisions/ADR-01.md` … `ADR-12.md` |
| Per-task change history (T1..T11) | `changes/T1-summary.md` … `T11-summary.md` |
| Chronological merge log | `CHANGELOG.md` |

### Convert markdown → DOCX

For the markdown sources to be submitted as DOCX, install [pandoc](https://pandoc.org/) then:

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
```

Mermaid diagrams in the markdown sources need pandoc with `--filter pandoc-mermaid` for inline rendering, OR pre-render them via the [Mermaid CLI](https://github.com/mermaid-js/mermaid-cli):

```bash
mmdc -i docs/architecture/data-model.md -o data-model.png
```

---

## Cost stance

**$0 through every phase. No credit card on file at any point.** See `docs/tech-doc.en.md` § "Cost stance" for the full table. Optional paid paths (Play Store $25, Apple Developer $99/yr) are flagged but never required.

---

## Legacy prototype

The original Vite-React prototype lives at `legacy/` for reference. See `legacy/README.md` for the original notes. Visual aesthetic (re-themed to Mercury × Raycast in ADR-02) and the NLP parser are the only things ported into `app/`; nothing else is reused.

---

## License

MIT (or as specified by the class).
