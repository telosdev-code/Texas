# Hold'em Math Lab — Roadmap

An educational Texas Hold'em app. Simulated chips only — no real money, no purchases, no gambling mechanics.
The goal is to teach probability, expected value and game theory.

Legend: ✅ done · 🟡 partial · ⬜ not started

## Guiding principle: provenance of every number

Every number shown to the learner carries one of four labels (`src/core/provenance.ts`, rendered by `ProvenanceBadge`):

| Label | Meaning | Example |
|---|---|---|
| **Exact** | Full enumeration or a closed-form formula. Exact *given the stated assumptions*. | River equity vs a stated range; pot odds; combo counts |
| **Monte Carlo** | Random-sampling estimate, shown with sample count and a 95% confidence interval. | Preflop multiway equity |
| **Heuristic** | Rule of thumb or hand-written strategy. Never called GTO. | Bots, example ranges, review mistake flags |
| **Solver (CFR)** | Output of an actual equilibrium solver run, with iteration count and exploitability. | Kuhn poker equilibrium |

---

## Phase 1 — Web MVP ✅

| Item | Status | Notes |
|---|---|---|
| Card model, seeded RNG | ✅ | `src/core/cards.ts`, `rng.ts` |
| 5–7 card evaluator | ✅ | Verified against all 2,598,960 five-card hands and a naive reference evaluator |
| Combinatorics, range parser/serializer | ✅ | Card removal, `22+`, `A2s-A5s`, weights |
| EV / pot odds / MDF / bluff-ratio / implied odds / winnable pot | ✅ | `src/core/ev.ts` |
| Equity: exact enumeration under a work budget, Monte Carlo otherwise | ✅ | Hands or ranges, dead cards, std. error |
| NLHE engine: blinds, heads-up order, min-raise, short all-in non-reopening, side pots, uncalled bets, odd chip | ✅ | Pure/immutable; 600 random-hand invariant test |
| Heuristic bots (6 profiles) behind a `Strategy` interface | ✅ | Bots see only a `PlayerView` |
| Playable table with live decision-math panel, study mode, settings | ✅ | 1–8 opponents |
| Equity calculator page | ✅ | Up to 6 players |
| 13×13 range matrix | ✅ | Drag-paint, weighted brush, top-X%, presets, text I/O |
| Decision trainer (5 drill types, step-by-step explanations) | ✅ | |
| Hand-history review, mistake flags, progress charts | ✅ | Heuristic range estimation, labelled as such |
| Lessons + live CFR demo on Kuhn poker | ✅ | |
| CFR / CFR+ framework, best response, exploitability | ✅ | Generic `ExtensiveGame` interface |
| PWA: manifest, icons, service worker, offline | ✅ | Verified offline reload in Chromium |
| Responsive layout (phone + desktop) | ✅ | Tested 360–1366px wide in Chromium |
| Unit tests (Vitest) | ✅ | 55 tests: rules, probability, EV, solver, trainer, review |

### Known gaps in Phase 1
| Item | Status | Notes |
|---|---|---|
| Tested on real iOS Safari / Android Chrome | ⬜ | Only desktop Chromium (incl. phone-sized viewports) so far |
| CI (tests + build on every PR) | ⬜ | |
| Lint (ESLint) and formatting (Prettier) | ⬜ | |
| End-to-end tests committed to the repo | ⬜ | A Playwright walkthrough was run manually but is not in the repo |
| CFR+ convergence speed | 🟡 | Converges correctly but slower than expected (≈3e-3 exploitability at 3k iterations); worth profiling against a reference implementation |
| Preflop hand-vs-range equity is always Monte Carlo | 🟡 | Exact needs ~70M evaluations; could use suit isomorphism or a precomputed table |
| Bots estimate equity vs. random hands | 🟡 | Deliberate for the MVP; see Phase 2 opponent modelling |
| Accessibility audit (screen reader, contrast, reduced motion) | 🟡 | Labels and keyboard support exist; no formal audit |
| Light theme | ⬜ | Dark only |

---

## Phase 2 — iOS (and Android) app ⬜

**Recommended route: wrap the existing app with [Capacitor](https://capacitorjs.com/).** All of the TypeScript
(math, engine, solver, UI) is reused unchanged; the work is native packaging, storage, polish and App Store compliance.

Effort estimate for one developer already familiar with the codebase: **~2–3 weeks to App Store submission**, plus
Apple review time. A Mac with Xcode and an Apple Developer Program membership are required.

### 2a. iOS Safari PWA hardening (≈2–3 days) — useful on its own, and a prerequisite for 2b
| Item | Status | Notes |
|---|---|---|
| `apple-touch-icon` | ✅ | |
| Safe-area insets (notch / home indicator) | 🟡 | Top bar and bottom nav use `env(safe-area-inset-*)`; needs device check |
| `apple-mobile-web-app-capable` / status-bar-style meta tags | ⬜ | |
| iOS launch (splash) images | ⬜ | |
| Test module Web Worker, `structuredClone`, service worker on iOS 16+ Safari | ⬜ | All are supported on recent iOS; must verify on device |
| Touch painting on the range matrix under Safari (pointer events, `touch-action`) | ⬜ | Works in Chromium touch emulation |
| Prevent double-tap zoom / rubber-band scroll on the table | ⬜ | |
| Persist storage: `navigator.storage.persist()` and warn about Safari's storage eviction for non-installed sites | ⬜ | |

### 2b. Native wrapper with Capacitor (≈1–1.5 weeks)
| Item | Status | Notes |
|---|---|---|
| Add Capacitor, generate the iOS (Xcode) project | ⬜ | `npx cap add ios` |
| Build config: relative asset paths (already `base: './'`), disable the service worker inside the native shell | ⬜ | Assets ship inside the app, so the SW is unnecessary there |
| Move persistence from `localStorage` to Capacitor Preferences or SQLite | ⬜ | WKWebView storage can be cleared by the OS; `src/storage/storage.ts` is the single place to change |
| Export / import of hand histories and progress (Share sheet / Files) | ⬜ | Also guards against data loss |
| Haptics on actions, native status bar and splash | ⬜ | Capacitor plugins |
| Dynamic Type / text scaling, VoiceOver pass | ⬜ | |
| iPad layout (split view, larger table) | ⬜ | Desktop layout is a good starting point |
| App icon set and launch screen in Xcode | ⬜ | Source SVG exists in `public/icon.svg` |
| Performance check on older devices (evaluator, Monte Carlo in the worker) | ⬜ | ~7M evals/s on desktop; expect 2–4× slower on older iPhones |

### 2c. App Store submission (≈3–5 days plus review)
| Item | Status | Notes |
|---|---|---|
| Apple Developer account, bundle ID, signing, TestFlight build | ⬜ | |
| Age rating questionnaire | ⬜ | Simulated gambling content raises the rating; answer accurately in App Store Connect |
| Make the "simulated chips only, no real-money gambling" nature explicit in description and in-app | 🟡 | Stated in-app; add to listing and first-run screen |
| Privacy: no data collection, no tracking; privacy policy URL; privacy manifest | ⬜ | All data stays on device today |
| Avoid "minimum functionality" (wrapped website) rejection | 🟡 | App is offline and feature-rich; native touches in 2b strengthen this |
| Screenshots for required iPhone and iPad sizes | ⬜ | |

### Alternatives considered
| Route | Effort | Trade-off |
|---|---|---|
| PWA only (2a) | ~2–3 days | No App Store presence; iOS install is manual via "Add to Home Screen" |
| **Capacitor (recommended)** | ~2–3 weeks | Reuses 100% of code; web-view UI |
| React Native / Expo | ~5–8 weeks | Reuses the ~2,900 lines of pure logic (`core`, `engine`, `bots`, `solver`, `trainer`, `review`); the ~2,750 lines of UI and CSS must be rewritten |
| Native SwiftUI | ~2–3 months | Full rewrite; best native feel |

---

## Phase 3 — Deeper training ⬜
| Item | Status |
|---|---|
| Raise-sizing drills; multi-street scenario trees | ⬜ |
| Equity realisation, implied and reverse-implied odds drills | ⬜ |
| Range-vs-range equity heat map per hand class | ⬜ |
| Opponent modelling from observed stats (VPIP / PFR / aggression) feeding Bayesian range narrowing | ⬜ |
| Board-aware range estimation in review (currently preflop-based plus postflop narrowing) | ⬜ |
| Spaced repetition: schedule weak drill types more often | ⬜ |
| IndexedDB storage for large histories | ⬜ |

## Phase 4 — Solvers ⬜
| Item | Status |
|---|---|
| Generic CFR framework, exploitability, Kuhn poker reference | ✅ |
| `StrategySource` contract (only solver output can be labelled solver-derived) | ✅ |
| River subgame solver (CFR+ over discretised bet sizes on a fixed board) | ⬜ |
| Preflop push/fold Nash solver for short stacks (replaces heuristic jam charts) | ⬜ |
| Bot adapter that plays a solver `StrategySource` | ⬜ |
| WASM evaluator for faster enumeration and solving | ⬜ |

## Phase 5 — Polish ⬜
| Item | Status |
|---|---|
| Light theme | ⬜ |
| Internationalisation | ⬜ |
| Animations and optional sound | ⬜ |
| Guided first-run tutorial | ⬜ |
