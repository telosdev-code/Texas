# Hold'em Math Lab

An educational Texas Hold'em Progressive Web App that teaches **probability, expected value and game theory**.
It uses **simulated chips only**: no real money, no purchases, no gambling mechanics.

Built with React 19, TypeScript and Vite. It works offline after the first visit.

```bash
npm install          # .npmrc sets legacy-peer-deps (works around an npm peer-resolution bug)
npm run dev          # http://localhost:5173
npm test             # 55 unit tests (rules, probability, EV, solver)
npm run build        # type-check + production build + service worker
npm run preview      # serve the production build (test offline mode here)
```

## Features

| Tab | What it does |
|---|---|
| **Play** | Full No-Limit Hold'em table with 1–8 configurable computer opponents. A live "decision math" panel shows pot odds, required equity and Monte Carlo equity. Study mode shows opponents' cards. |
| **Train** | Decision drills (call/fold vs a stated range, equity estimation, counting outs, combinatorics, bluffing math). You decide first, then get a step-by-step explanation. |
| **Equity** | Equity calculator for 2–6 players, each a hand or a range, plus board cards. Uses exact enumeration within a work budget and Monte Carlo (with a 95% CI) beyond it. |
| **Ranges** | Interactive 13×13 matrix: drag to paint, weighted brushes, top-X% slider, example ranges, text import/export, combo counts. |
| **Review** | Hand histories with per-decision analysis against estimated opponent ranges, mistake flags with estimated cost in BB, and progress charts. |
| **Learn** | Lessons with live calculators (pot odds, EV, combinatorics, bluffing frequencies, ranges), plus a CFR solver run live on Kuhn poker. |

## Every number is labelled by where it came from

`src/core/provenance.ts` defines four kinds of result, and the `ProvenanceBadge` component shows the kind next to each number:

- **Exact**: full enumeration or a closed-form formula, exact *given its stated assumptions*.
- **Monte Carlo estimate**: shown with its sample count and 95% confidence interval.
- **Heuristic**: bots, example ranges, rule of 2/4, and review mistake flags. None of these are called GTO.
- **Solver-derived (CFR)**: only output of an actual CFR run, with its iteration count and exploitability. `fromProfile()` refuses to wrap anything that isn't solver output.

## Architecture

```
src/core/      cards, 7-card evaluator, combinatorics, ranges, equity (exact + MC), EV formulas, RNG, provenance
src/engine/    pure immutable NLHE state machine + side-pot builder
src/bots/      Strategy interface, PlayerView (no hidden info), heuristic profiles
src/solver/    generic ExtensiveGame interface, CFR / CFR+, best response & exploitability, Kuhn poker, StrategySource
src/trainer/   drill generators and graders
src/review/    hand-history analysis, range estimation, progress stats
src/workers/   Web Worker RPC: equity, drills, reviews and CFR run off the UI thread
src/ui/        React pages and components
```

Rules implemented by the engine include heads-up blind order, minimum bet and raise, the rule that a short all-in raise doesn't reopen betting, return of uncalled bets, main and side pots, and the odd-chip rule.

### Adding a CFR solver for Hold'em (Phase 3)

1. Model the subgame (for example a river spot with discretized bet sizes) as an `ExtensiveGame<S>` in `src/solver/`.
2. Run `solveCfr(game, { iterations, variant: 'CFR+' })`. It returns the average strategy, the game value and the exploitability.
3. Wrap the result with `fromProfile(result.average, result.provenance)` to get a `StrategySource`.
4. Write a `Strategy` adapter in `src/bots/` that maps a `PlayerView` to an info-set key and samples from `policy()`.
   Because the provenance is `solver`, the UI will label it as solver-derived automatically.

See [PLAN.md](PLAN.md) for the full phased roadmap.

## Verification highlights

- The evaluator reproduces the exact frequency of every hand category over all 2,598,960 five-card hands, and agrees with a naive reference evaluator on random 7-card hands.
- AA vs KK is computed by enumerating all 1,712,304 boards. Monte Carlo results fall within 4σ of exact values.
- In the engine, 600 random hands with 2–9 players and random legal actions all conserve chips, never duplicate a card, and always end.
- In the solver, CFR+ on Kuhn poker converges to the analytic game value −1/18 and matches the known equilibrium family.
