import { useMemo, useState } from 'react';
import type { Card } from '../../core/cards';
import { estimateExactWork, type EquityPlayer, type EquityResult } from '../../core/equity';
import { RANGE_PRESETS } from '../../core/presets';
import { countCombos, formatRange, parseRange, rangeToCombos, type Range } from '../../core/ranges';
import { compute } from '../../workers/client';
import { CardPicker } from '../components/CardPicker';
import { CardView } from '../components/CardView';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { RangeMatrix } from '../components/RangeMatrix';
import { num, pct } from '../format';

interface Seat {
  mode: 'hand' | 'range';
  cards: (Card | null)[];
  rangeText: string;
}

type Slot = { kind: 'seat'; seat: number; idx: number } | { kind: 'board'; idx: number };

const EXACT_BUDGET = 6_000_000;

export function EquityPage() {
  const [seats, setSeats] = useState<Seat[]>([
    { mode: 'hand', cards: [48, 49], rangeText: '' },
    { mode: 'range', cards: [null, null], rangeText: 'QQ+, AKs, AKo' },
  ]);
  const [board, setBoard] = useState<(Card | null)[]>([null, null, null, null, null]);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [editingRange, setEditingRange] = useState<number | null>(null);
  const [method, setMethod] = useState<'auto' | 'monte-carlo'>('auto');
  const [samples, setSamples] = useState(100_000);
  const [result, setResult] = useState<{ r: EquityResult; ms: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = useMemo(() => {
    const s = new Set<Card>();
    seats.forEach((st) => st.mode === 'hand' && st.cards.forEach((c) => c !== null && s.add(c)));
    board.forEach((c) => c !== null && s.add(c));
    return s;
  }, [seats, board]);

  const boardCards = board.filter((c): c is Card => c !== null);

  const build = (): { players: EquityPlayer[]; err?: string } => {
    if (boardCards.length > 0 && boardCards.length < 3) return { players: [], err: 'The board needs 0, 3, 4 or 5 cards.' };
    const dead = [...used];
    const players: EquityPlayer[] = [];
    for (const [i, st] of seats.entries()) {
      if (st.mode === 'hand') {
        if (st.cards.some((c) => c === null)) return { players: [], err: `Player ${i + 1} needs two cards.` };
        players.push({ kind: 'hand', cards: [st.cards[0]!, st.cards[1]!] });
      } else {
        let r: Range;
        try {
          r = parseRange(st.rangeText);
        } catch (e) {
          return { players: [], err: `Player ${i + 1}: ${(e as Error).message}` };
        }
        const combos = rangeToCombos(r, dead);
        if (!combos.length) return { players: [], err: `Player ${i + 1}'s range is empty after card removal.` };
        players.push({ kind: 'range', combos });
      }
    }
    return { players };
  };

  const built = build();
  const work = built.err ? 0 : estimateExactWork({ players: built.players, board: boardCards });
  const willBeExact = method === 'auto' && work <= EXACT_BUDGET;

  const run = () => {
    if (built.err) return setError(built.err);
    setError(null);
    setRunning(true);
    const t0 = performance.now();
    compute
      .equity({ players: built.players, board: boardCards, method, samples, seed: Date.now() & 0xffff, maxExactEvaluations: EXACT_BUDGET })
      .then((r) => setResult({ r, ms: performance.now() - t0 }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setRunning(false));
  };

  const pickCard = (c: Card | null) => {
    if (!picking) return;
    if (picking.kind === 'board') setBoard((b) => b.map((x, i) => (i === picking.idx ? c : x)));
    else
      setSeats((ss) =>
        ss.map((s, i) => (i === picking.seat ? { ...s, cards: s.cards.map((x, k) => (k === picking.idx ? c : x)) } : s)),
      );
    // Advance to the next empty slot for fast entry.
    if (c !== null) {
      if (picking.kind === 'seat' && picking.idx === 0) setPicking({ ...picking, idx: 1 });
      else if (picking.kind === 'board' && picking.idx < 4) setPicking({ kind: 'board', idx: picking.idx + 1 });
      else setPicking(null);
    }
  };

  const update = (i: number, patch: Partial<Seat>) => {
    setSeats((ss) => ss.map((s, k) => (k === i ? { ...s, ...patch } : s)));
    setResult(null);
  };

  return (
    <div className="page equity">
      <header className="page-head">
        <div>
          <h2>Equity calculator</h2>
          <p className="muted">
            Exact enumeration when the work fits the budget ({num(EXACT_BUDGET)} hand evaluations), Monte Carlo otherwise.
          </p>
        </div>
      </header>

      <div className="equity-grid">
        <section className="panel">
          <h3>Players</h3>
          {seats.map((st, i) => {
            const res = result && result.r.equity.length === seats.length ? result.r : null;
            let combos = 0;
            if (st.mode === 'range') {
              try {
                combos = countCombos(parseRange(st.rangeText), [...used]);
              } catch {
                combos = 0;
              }
            }
            return (
              <div key={i} className="eq-player">
                <div className="eq-player-head">
                  <strong>Player {i + 1}</strong>
                  <div className="seg">
                    <button className={st.mode === 'hand' ? 'on' : ''} onClick={() => update(i, { mode: 'hand' })}>Hand</button>
                    <button className={st.mode === 'range' ? 'on' : ''} onClick={() => update(i, { mode: 'range' })}>Range</button>
                  </div>
                  {seats.length > 2 && (
                    <button className="btn ghost small" onClick={() => setSeats((ss) => ss.filter((_, k) => k !== i))} aria-label={`Remove player ${i + 1}`}>
                      ✕
                    </button>
                  )}
                </div>
                {st.mode === 'hand' ? (
                  <div className="slots">
                    {st.cards.map((c, k) => (
                      <button key={k} className="slot" onClick={() => setPicking({ kind: 'seat', seat: i, idx: k })} aria-label={`Player ${i + 1} card ${k + 1}`}>
                        <CardView card={c} size="md" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="range-input">
                    <input
                      value={st.rangeText}
                      onChange={(e) => update(i, { rangeText: e.target.value })}
                      aria-label={`Player ${i + 1} range`}
                      placeholder="e.g. 22+, A2s+, KTo+"
                    />
                    <div className="row gap wrap small">
                      <button className="btn small" onClick={() => setEditingRange(i)}>Edit in matrix</button>
                      <select
                        value=""
                        onChange={(e) => e.target.value && update(i, { rangeText: RANGE_PRESETS.find((p) => p.id === e.target.value)!.text })}
                        aria-label="Load preset range"
                      >
                        <option value="">Preset…</option>
                        {RANGE_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <span className="muted">{num(combos)} combos after card removal</span>
                    </div>
                  </div>
                )}
                {res && (
                  <div className="eq-result">
                    <div className="eqbar">
                      <div className="eqbar-fill" style={{ width: `${res.equity[i] * 100}%` }} />
                    </div>
                    <span className="eq-num">{pct(res.equity[i], 2)}</span>
                    {res.method === 'monte-carlo' && <span className="muted small">±{(1.96 * res.stdError[i] * 100).toFixed(2)}</span>}
                    <span className="muted small">
                      win {pct(res.win[i], 2)} · split {pct(res.tie[i], 2)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {seats.length < 6 && (
            <button className="btn" onClick={() => setSeats((s) => [...s, { mode: 'range', cards: [null, null], rangeText: '22+, A2s+, KTs+, ATo+' }])}>
              + Add player
            </button>
          )}
        </section>

        <section className="panel">
          <h3>Board</h3>
          <div className="slots">
            {board.map((c, k) => (
              <button key={k} className="slot" onClick={() => setPicking({ kind: 'board', idx: k })} aria-label={`Board card ${k + 1}`}>
                <CardView card={c} size="md" />
              </button>
            ))}
          </div>
          <div className="row gap wrap">
            <button className="btn small ghost" onClick={() => setBoard([null, null, null, null, null])}>Clear board</button>
          </div>

          <h3>Method</h3>
          <div className="seg">
            <button className={method === 'auto' ? 'on' : ''} onClick={() => setMethod('auto')}>Auto (exact if feasible)</button>
            <button className={method === 'monte-carlo' ? 'on' : ''} onClick={() => setMethod('monte-carlo')}>Force Monte Carlo</button>
          </div>
          {method === 'monte-carlo' || !willBeExact ? (
            <label className="small">
              Samples{' '}
              <select value={samples} onChange={(e) => setSamples(Number(e.target.value))}>
                {[10_000, 50_000, 100_000, 300_000, 1_000_000].map((s) => (
                  <option key={s} value={s}>{num(s)}</option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="muted small">
            {built.err
              ? built.err
              : willBeExact
                ? `Will enumerate exactly: ~${num(work)} hand evaluations.`
                : `Exact enumeration would need ~${num(work)} evaluations — using Monte Carlo (error shrinks like 1/√samples).`}
          </p>
          <button className="btn primary big" onClick={run} disabled={running || !!built.err}>
            {running ? 'Calculating…' : 'Calculate equity'}
          </button>
          {error && <p className="neg">{error}</p>}
          {result && (
            <div className="result-meta">
              <ProvenanceBadge p={result.r.provenance} />
              <span className="muted small"> {result.ms.toFixed(0)} ms</span>
            </div>
          )}
        </section>
      </div>

      {picking && (
        <CardPicker
          disabled={used}
          selected={picking.kind === 'board' ? board[picking.idx] : seats[picking.seat].cards[picking.idx]}
          onPick={pickCard}
          onClose={() => setPicking(null)}
          title={picking.kind === 'board' ? `Board card ${picking.idx + 1}` : `Player ${picking.seat + 1}, card ${picking.idx + 1}`}
        />
      )}
      {editingRange !== null && (
        <RangeModal
          text={seats[editingRange].rangeText}
          onSave={(t) => {
            update(editingRange, { rangeText: t });
            setEditingRange(null);
          }}
          onClose={() => setEditingRange(null)}
        />
      )}
    </div>
  );
}

function RangeModal({ text, onSave, onClose }: { text: string; onSave: (t: string) => void; onClose: () => void }) {
  const [range, setRange] = useState<Range>(() => {
    try {
      return parseRange(text);
    } catch {
      return new Float64Array(169);
    }
  });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-label="Edit range" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Edit range — {num(countCombos(range))} combos</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <RangeMatrix range={range} onChange={setRange} />
        <code className="range-text">{formatRange(range) || '(empty)'}</code>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setRange(new Float64Array(169))}>Clear</button>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(formatRange(range))}>Use this range</button>
        </div>
      </div>
    </div>
  );
}
