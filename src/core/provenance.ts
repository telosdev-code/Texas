/**
 * Every number shown to a learner is tagged with where it came from.
 * These categories are deliberately kept separate: a heuristic must never be presented as GTO,
 * and "solver" is reserved for output of an actual equilibrium computation.
 */
export type Provenance =
  | { kind: 'exact'; detail: string }
  | { kind: 'monte-carlo'; samples: number; stdError: number; detail?: string }
  | { kind: 'heuristic'; detail: string }
  | {
      kind: 'solver';
      algorithm: 'CFR' | 'CFR+';
      game: string;
      iterations: number;
      /** Exploitability in the game's units (e.g. chips per hand); smaller is closer to equilibrium. */
      exploitability: number;
    };

export type ProvenanceKind = Provenance['kind'];

export const PROVENANCE_LABEL: Record<ProvenanceKind, string> = {
  exact: 'Exact',
  'monte-carlo': 'Monte Carlo estimate',
  heuristic: 'Heuristic',
  solver: 'Solver-derived (CFR)',
};

export const PROVENANCE_EXPLAINER: Record<ProvenanceKind, string> = {
  exact:
    'Computed by complete enumeration or a closed-form formula. Exact given the stated assumptions (for example, a stated opponent range).',
  'monte-carlo':
    'Estimated by random sampling. The true value lies within the shown 95% interval about 95% of the time.',
  heuristic:
    'A rule of thumb or hand-written strategy. Useful for learning, but not an equilibrium (GTO) strategy.',
  solver:
    'Produced by running Counterfactual Regret Minimization to (near) equilibrium. Exploitability is reported.',
};

export const exact = (detail: string): Provenance => ({ kind: 'exact', detail });
export const heuristic = (detail: string): Provenance => ({ kind: 'heuristic', detail });
