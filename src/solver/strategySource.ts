import type { Provenance } from '../core/provenance';
import type { StrategyProfile } from './game';

/**
 * Contract for plugging solver output into the rest of the app (bots, trainer, review).
 *
 * Only a StrategySource whose provenance is `solver` — produced by a converged CFR run with a
 * reported exploitability — may be shown to learners as "GTO". Everything else is a heuristic.
 *
 * Future work (see PLAN.md, Phase 3): a Hold'em river-subgame solver will implement
 * `ExtensiveGame`, run `solveCfr`, and expose its result through this interface; a bot adapter
 * will map a PlayerView to an info-set key and sample an action from `policy`.
 */
export interface StrategySource {
  provenance: Provenance;
  policy(infoSetKey: string): Record<string, number> | undefined;
}

export function fromProfile(profile: StrategyProfile, provenance: Provenance): StrategySource {
  if (provenance.kind !== 'solver') {
    throw new Error('Only solver-derived profiles may be wrapped as a solver StrategySource');
  }
  return { provenance, policy: (key) => profile[key] };
}
