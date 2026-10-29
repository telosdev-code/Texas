import { useState } from 'react';
import { PROVENANCE_EXPLAINER, PROVENANCE_LABEL, type Provenance } from '../../core/provenance';

const ICON: Record<Provenance['kind'], string> = { exact: '=', 'monte-carlo': '≈', heuristic: '~', solver: '⚖' };

function detailOf(p: Provenance): string {
  switch (p.kind) {
    case 'exact':
    case 'heuristic':
      return p.detail;
    case 'monte-carlo':
      return `${p.samples.toLocaleString('en-US')} samples, 95% CI ±${(1.96 * p.stdError * 100).toFixed(2)} pts.${p.detail ? ' ' + p.detail : ''}`;
    case 'solver':
      return `${p.algorithm} on ${p.game}, ${p.iterations.toLocaleString('en-US')} iterations, exploitability ${p.exploitability.toExponential(2)}.`;
  }
}

/** Visible tag saying whether a number is exact, a Monte Carlo estimate, a heuristic, or solver output. */
export function ProvenanceBadge({ p, compact = false }: { p: Provenance; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="prov-wrap">
      <button
        type="button"
        className={`prov prov-${p.kind}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={`${PROVENANCE_LABEL[p.kind]}: ${detailOf(p)}`}
      >
        <span aria-hidden>{ICON[p.kind]}</span> {compact ? PROVENANCE_LABEL[p.kind].split(' ')[0] : PROVENANCE_LABEL[p.kind]}
      </button>
      {open && (
        <span className="prov-pop" role="note">
          <strong>{PROVENANCE_LABEL[p.kind]}.</strong> {PROVENANCE_EXPLAINER[p.kind]}
          <br />
          <em>{detailOf(p)}</em>
        </span>
      )}
    </span>
  );
}

export function ProvenanceLegend() {
  const kinds: Provenance['kind'][] = ['exact', 'monte-carlo', 'heuristic', 'solver'];
  return (
    <ul className="prov-legend">
      {kinds.map((k) => (
        <li key={k}>
          <span className={`prov prov-${k} static`}>
            <span aria-hidden>{ICON[k]}</span> {PROVENANCE_LABEL[k]}
          </span>
          <span>{PROVENANCE_EXPLAINER[k]}</span>
        </li>
      ))}
    </ul>
  );
}
