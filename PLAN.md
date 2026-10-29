# Hold'em Math Lab — Phased Implementation Plan

An educational Texas Hold'em PWA. Simulated chips only — no real money, no purchases,
no gambling mechanics. The goal is to teach probability, expected value and game theory.

## Guiding principle: provenance of every number

Every number shown to the learner carries one of four provenance labels
(`src/core/provenance.ts`, rendered by `ProvenanceBadge`):

| Label | Meaning | Example |
|---|---|---|
| **Exact** | Computed by full enumeration or a closed-form formula. Exact *given the stated assumptions* (e.g. a stated villain range). | River equity vs a range; pot odds; combo counts |
| **Monte Carlo** | Random-sampling estimate, always shown with sample count and a 95% confidence interval. | Preflop 3-way equity |
| **Heuristic** | A rule of thumb or hand-written strategy. Never called GTO. | Bot play, preset opening ranges, review mistake flags |
| **Solver (CFR)** | Output of an actual equilibrium solver run, with iteration count and exploitability. | Kuhn poker equilibrium (MVP) |

## Architecture

```
src/
  core/       pure math: cards, 7-card evaluator, combinatorics, ranges, equity, EV, RNG, provenance
  engine/     pure, immutable No-Limit Hold'em state machine (blinds, streets, legal actions, side pots, showdown)
  bots/       Strategy interface + heuristic profiles (Rock, TAG, LAG, Calling Station, Maniac)
  solver/     CFR framework (generic extensive-form Game interface + vanilla/CFR+), Kuhn poker reference game
  trainer/    drill generators + graders (pot odds, equity estimation, combinatorics, bluff math)
  review/     hand-history analysis: decision extraction, range estimation, mistake detection, progress stats
  storage/    versioned localStorage persistence (hand histories, drill results, settings)
  workers/    Web Worker for equity calculation (keeps UI responsive)
  ui/         React components and pages
```

The engine, math and solver layers have **no React dependencies** and are fully unit-tested in Node.
Bots receive only a `PlayerView` (no hidden information) and implement `Strategy`, so a future
CFR-derived strategy is a drop-in replacement: `solver/` exposes a generic `Game<State, Action>`
interface and a `StrategySource` contract tagged with `provenance: 'solver'`.

## Phase 1 — MVP (this delivery)
1. Core math: card model, fast 7-card evaluator (verified against all 2,598,960 five-card hands),
   combinatorics, range parser/serializer, EV/pot-odds/MDF/bluff-ratio formulas.
2. Equity engine: exact enumeration under a work budget, Monte Carlo otherwise (with standard error),
   hands *or* ranges per player, card removal, dead cards. Runs in a Web Worker.
3. Game engine: 2–9 seats, blinds, heads-up blind rules, min-raise and short all-in (non-reopening) rules,
   side pots, uncalled-bet return, odd-chip rule, showdown, hand history log.
4. Configurable heuristic bots (5 profiles + tunable parameters).
5. Playable table (mobile + desktop), live pot-odds HUD, optional face-up bots for study.
6. Equity calculator page.
7. Interactive 13×13 range matrix (click/drag paint, presets, top-X% slider, text import/export, combo counts).
8. Decision trainer: call/fold EV drills vs explicit ranges, equity estimation, combinatorics, bluff math —
   with step-by-step explanations after each answer.
9. Hand-history review: per-decision equity vs estimated ranges, mistake flags (heuristic, labeled), progress tracking.
10. Lessons: pot odds, EV, combinatorics, bluffing frequencies, range estimation, and a live CFR demo on Kuhn poker.
11. PWA: manifest, icons, service worker precache → full offline use.
12. Vitest suites for rules, probability and EV.

## Phase 2 — Deeper training
- Raise-sizing drills; multi-street scenario trees; equity realization and implied/reverse-implied odds drills.
- Weighted (fractional) ranges in the matrix; range-vs-range equity heat maps per hand class.
- Opponent modelling from observed stats (VPIP/PFR/AF) feeding Bayesian range narrowing.
- IndexedDB storage, export/import of histories (JSON), spaced-repetition scheduling of weak drill types.

## Phase 3 — Solvers
- River subgame solver (CFR+ over discretized bet sizes, card-abstraction-free on a fixed board), exploitability report.
- Preflop push/fold Nash solver for short stacks (exactly solvable; replaces heuristic jam charts).
- Plug solver strategies into bots via `StrategySource` (only labelled "GTO/Solver" when derived from a converged run
  with reported exploitability).

## Phase 4 — Polish
- Accessibility audit, i18n, animations, sound toggles, tutorial walkthroughs, performance profiling (WASM evaluator).
