import { useCallback, useEffect, useState } from 'react';
import { randomSeed } from '../../core/rng';
import { DRILL_INFO, gradeDrill, type Drill, type DrillKind, type Grade } from '../../trainer/drills';
import { haptics } from '../../platform/native';
import { compute } from '../../workers/client';
import { CardRow } from '../components/CardView';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { pct } from '../format';
import { useStore } from '../store';

const KINDS = Object.keys(DRILL_INFO) as DrillKind[];
type Mode = DrillKind | 'mixed';

export function TrainerPage() {
  const { addDrill } = useStore();
  const [mode, setMode] = useState<Mode>('call-fold');
  const [drill, setDrill] = useState<Drill | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionScore, setSessionScore] = useState({ right: 0, total: 0 });

  const next = useCallback(() => {
    const kind = mode === 'mixed' ? KINDS[Math.floor(Math.random() * KINDS.length)] : mode;
    setLoading(true);
    setGrade(null);
    setError(null);
    compute
      .drill(kind, randomSeed())
      .then(setDrill)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mode]);

  useEffect(next, [next]);

  const submit = (answer: number) => {
    if (!drill || grade) return;
    const g = gradeDrill(drill, answer);
    setGrade(g);
    if (g.correct) haptics.success();
    else haptics.warning();
    setSessionScore((s) => ({ right: s.right + (g.correct ? 1 : 0), total: s.total + 1 }));
    addDrill({ kind: drill.kind, timestamp: Date.now(), correct: g.correct, score: g.score, evLoss: g.evLoss });
  };

  return (
    <div className="page trainer">
      <header className="page-head">
        <div>
          <h2>Decision trainer</h2>
          <p className="muted">Make the decision first. The math comes afterwards.</p>
        </div>
        <div className="score" aria-live="polite">
          This session: <strong>{sessionScore.right}</strong> / {sessionScore.total}
        </div>
      </header>
      <nav className="tabs" aria-label="Drill type">
        {[...KINDS, 'mixed' as const].map((k) => (
          <button key={k} className={`tab${mode === k ? ' on' : ''}`} onClick={() => setMode(k)}>
            {k === 'mixed' ? 'Mixed' : DRILL_INFO[k].title}
          </button>
        ))}
      </nav>
      {mode !== 'mixed' && <p className="muted small">{DRILL_INFO[mode].blurb}</p>}

      {error && <p className="neg">Could not generate a drill: {error}</p>}
      {loading && !drill && <p className="muted">Dealing…</p>}
      {drill && (
        <div className={`drill${loading ? ' loading' : ''}`}>
          <DrillView drill={drill} grade={grade} onSubmit={submit} />
          {grade && (
            <section className={`panel grade ${grade.correct ? 'good' : 'bad'}`} aria-live="polite">
              <h3>
                {grade.correct ? '✓ Correct' : '✗ Not quite'} — {grade.headline}
              </h3>
              {grade.evLoss !== undefined && grade.evLoss > 0 && (
                <p className="neg">This choice costs {grade.evLoss.toFixed(1)} chips on average.</p>
              )}
              <table className="steps">
                <tbody>
                  {grade.steps.map((s, i) => (
                    <tr key={i}>
                      <th scope="row">{s.label}</th>
                      <td>
                        <div>{s.value}</div>
                        {s.formula && <code>{s.formula}</code>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="assumptions">
                <span>Result type:</span> <ProvenanceBadge p={drill.provenance} />
                <ul>
                  {drill.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
              <button className="btn primary big" onClick={next} autoFocus>
                Next question →
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function DrillView({ drill, grade, onSubmit }: { drill: Drill; grade: Grade | null; onSubmit: (a: number) => void }) {
  const [estimate, setEstimate] = useState(50);
  const [count, setCount] = useState('');
  useEffect(() => {
    setEstimate(50);
    setCount('');
  }, [drill.id]);
  const done = !!grade;

  return (
    <section className="panel spot">
      <p className="prompt">{drill.prompt}</p>
      <div className="spot-cards">
        {drill.hero && drill.hero.length > 0 && (
          <div>
            <div className="label">You</div>
            <CardRow cards={drill.hero} size="lg" />
          </div>
        )}
        {drill.villain && (
          <div>
            <div className="label">Villain</div>
            <CardRow cards={drill.villain} size="lg" />
          </div>
        )}
        {drill.board && (drill.board.length > 0 || drill.kind !== 'combos') && (
          <div>
            <div className="label">Board</div>
            <CardRow cards={drill.board} size="lg" slots={drill.kind === 'combos' ? 0 : 5} />
          </div>
        )}
      </div>
      {drill.villainRangeName && (
        <p className="range-note">
          Assume villain's range is <strong>{drill.villainRangeName}</strong>: <code className="range-text">{drill.villainRangeText}</code>
        </p>
      )}

      {drill.kind === 'call-fold' && (
        <div className="answer row gap">
          <button className="btn act fold big" disabled={done} onClick={() => onSubmit(0)}>Fold</button>
          <button className="btn act call big" disabled={done} onClick={() => onSubmit(1)}>Call {drill.bet}</button>
        </div>
      )}
      {drill.kind === 'equity-estimate' && (
        <form className="answer" onSubmit={(e) => { e.preventDefault(); onSubmit(estimate / 100); }}>
          <label className="slider-label">
            Your estimate: <strong>{estimate}%</strong>
            <input type="range" min={0} max={100} value={estimate} disabled={done} onChange={(e) => setEstimate(Number(e.target.value))} />
          </label>
          <button className="btn primary" disabled={done}>Lock in</button>
          {grade && <EquityBar guess={estimate / 100} truth={drill.answer} />}
        </form>
      )}
      {(drill.kind === 'outs' || drill.kind === 'combos') && (
        <form className="answer row gap" onSubmit={(e) => { e.preventDefault(); if (count !== '') onSubmit(Number(count)); }}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="amount"
            value={count}
            disabled={done}
            onChange={(e) => setCount(e.target.value)}
            aria-label={drill.kind === 'outs' ? 'Number of outs' : 'Number of combinations'}
            placeholder="?"
          />
          <button className="btn primary" disabled={done || count === ''}>Check</button>
        </form>
      )}
      {drill.kind === 'bluff-math' && drill.choices && (
        <div className="answer choices">
          {drill.choices.map((c, i) => (
            <button
              key={i}
              className={`btn choice${grade ? (i === drill.answer ? ' right' : '') : ''}`}
              disabled={done}
              onClick={() => onSubmit(i)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function EquityBar({ guess, truth }: { guess: number; truth: number }) {
  return (
    <div className="eqbar" aria-label={`Your guess ${pct(guess)}, exact ${pct(truth)}`}>
      <div className="eqbar-fill" style={{ width: `${truth * 100}%` }} />
      <div className="eqbar-mark" style={{ left: `${guess * 100}%` }} title="your guess" />
      <span className="eqbar-legend">
        bar = exact {pct(truth)} · marker = your guess {pct(guess, 0)}
      </span>
    </div>
  );
}
