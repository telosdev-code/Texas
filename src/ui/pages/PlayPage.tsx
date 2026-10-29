import { useEffect, useMemo, useState } from 'react';
import { BOT_PROFILES, profileById } from '../../bots/heuristicBot';
import { describeScore, evaluate } from '../../core/evaluator';
import { potOddsRatio, requiredEquity, winnablePot } from '../../core/ev';
import type { EquityResult } from '../../core/equity';
import { fullRange, rangeToCombos } from '../../core/ranges';
import { legalActions, positionLabels, potTotal } from '../../engine/engine';
import type { Action, HandState, LogEntry } from '../../engine/types';
import { compute } from '../../workers/client';
import { CardView } from '../components/CardView';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { describeLog, num, pct } from '../format';
import { DEFAULT_SETTINGS, useStore, type TableSettings } from '../store';
import { HUMAN_SEAT, useGame } from '../useGame';

export function PlayPage() {
  const { settings } = useStore();
  const { session, hand, deal, act, rebuy, restart } = useGame();
  const [showSettings, setShowSettings] = useState(false);
  const human = session.seats[HUMAN_SEAT];
  const canDeal = (!hand || hand.complete) && human.stack > 0;

  return (
    <div className="play">
      <div className="play-main">
        <Table hand={hand} seats={session.seats} showBotCards={settings.showBotCards} />
        <div className="under-table">
          {hand && !hand.complete && hand.toAct === HUMAN_SEAT ? (
            <ActionBar hand={hand} onAct={act} />
          ) : (
            <div className="deal-bar">
              {hand?.complete && <ResultLine hand={hand} />}
              {hand && !hand.complete && <span className="muted">Waiting for {hand.players[hand.toAct]?.name}…</span>}
              {canDeal && (
                <button className="btn primary big" onClick={deal}>
                  {hand ? 'Deal next hand' : 'Deal first hand'}
                </button>
              )}
              {(!hand || hand.complete) && human.stack <= 0 && (
                <button className="btn primary big" onClick={rebuy}>
                  Re-buy {settings.startingStackBB} BB (simulated chips)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <aside className="play-side">
        {settings.showHud && hand && !hand.complete && hand.players[HUMAN_SEAT].hole.length > 0 && <Hud hand={hand} />}
        <details className="panel" open>
          <summary>Hand {hand?.handNumber ?? '–'} log</summary>
          <HandLog log={hand?.log ?? []} names={(hand?.players ?? session.seats).map((p) => p.name)} />
        </details>
        <div className="row gap wrap">
          <button className="btn" onClick={() => setShowSettings(true)}>⚙ Table settings</button>
          <button className="btn ghost" onClick={() => confirm('Reset all stacks and start a new session?') && restart()}>
            New session
          </button>
        </div>
        <p className="muted small">
          Simulated chips only. Opponents use <strong>heuristic</strong> rule-based strategies, not GTO.
        </p>
      </aside>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

/**
 * Unit-circle position of seat i (seat 0 at the bottom, clockwise). On narrow portrait tables the
 * vertical coordinate is pushed outwards so side seats clear the board.
 */
function seatPos(i: number, n: number, narrow: boolean) {
  const angle = ((90 + (i * 360) / n) * Math.PI) / 180;
  const y = Math.sin(angle);
  return { x: Math.cos(angle), y: narrow ? Math.sign(y) * Math.abs(y) ** 0.6 : y };
}

function useNarrow() {
  const query = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

function lastActionLabel(hand: HandState, seat: number): string | null {
  for (let k = hand.log.length - 1; k >= 0; k--) {
    const e = hand.log[k];
    if (e.kind === 'street') return null;
    if (e.kind === 'action' && e.player === seat) {
      const t = e.action.type;
      return e.allIn ? 'All-in' : t === 'raise' ? 'Raise' : t[0].toUpperCase() + t.slice(1);
    }
  }
  return null;
}

function Table({ hand, seats, showBotCards }: { hand: HandState | null; seats: { name: string; stack: number; profileId?: string }[]; showBotCards: boolean }) {
  const n = seats.length;
  const narrow = useNarrow();
  const labels = hand ? positionLabels(hand) : [];
  const winners = new Set(hand?.result?.pots.flatMap((p) => p.winners) ?? []);
  return (
    <div className="table-wrap">
      <div className="felt">
        <div className="table-center">
          <div className="board">
            {[0, 1, 2, 3, 4].map((k) => (
              <CardView key={k} card={hand?.board[k] ?? null} size="md" />
            ))}
          </div>
          <div className="pot">
            Pot <strong>{hand ? num(potTotal(hand)) : 0}</strong>
          </div>
        </div>
        {seats.map((s, i) => {
          const pos = seatPos(i, n, narrow);
          const p = hand?.players[i];
          const showCards =
            p && p.hole.length > 0 && (i === HUMAN_SEAT || showBotCards || (hand!.complete && hand!.result!.showdown && !p.folded));
          const toAct = hand && !hand.complete && hand.toAct === i;
          const act = hand && p ? lastActionLabel(hand, i) : null;
          return (
            <div key={i}>
              <div
                className={`seat${toAct ? ' to-act' : ''}${p?.folded ? ' folded' : ''}${p?.out ? ' out' : ''}${winners.has(i) ? ' winner' : ''}${i === HUMAN_SEAT ? ' me' : ''}`}
                style={{ left: `${50 + pos.x * 44}%`, top: `${50 + pos.y * 41}%` }}
              >
                <div className="seat-cards">
                  {p && p.hole.length > 0 && !p.folded
                    ? p.hole.map((c, k) => <CardView key={k} card={c} faceDown={!showCards} size={i === HUMAN_SEAT ? 'md' : 'sm'} />)
                    : null}
                </div>
                <div className="seat-info">
                  <div className="seat-name">
                    {hand?.button === i && <span className="dealer" title="Dealer button">D</span>}
                    {s.name}
                  </div>
                  <div className="seat-stack">{num(p ? p.stack : s.stack)}</div>
                  <div className="seat-tags">
                    {labels[i] && <span className="tag">{labels[i]}</span>}
                    {p?.allIn && <span className="tag warn">All-in</span>}
                    {act && !p?.allIn && <span className="tag dim">{act}</span>}
                  </div>
                  {hand?.complete && hand.result?.showdown && p && !p.folded && !p.out && (
                    <div className="seat-hand">{hand.result.descriptions[i]}</div>
                  )}
                </div>
              </div>
              {p && p.streetBet > 0 && !hand!.complete && (
                <div className="bet-chip" style={{ left: `${50 + pos.x * 27}%`, top: `${50 + pos.y * 24}%` }}>
                  {num(p.streetBet)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultLine({ hand }: { hand: HandState }) {
  const net = hand.result!.net[HUMAN_SEAT];
  const bb = hand.config.bigBlind;
  return (
    <span className={`result ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}`}>
      {net > 0 ? `You won ${num(net)}` : net < 0 ? `You lost ${num(-net)}` : 'You broke even'} ({(net / bb).toFixed(1)} BB)
    </span>
  );
}

function ActionBar({ hand, onAct }: { hand: HandState; onAct: (a: Action) => void }) {
  const l = legalActions(hand, HUMAN_SEAT);
  const me = hand.players[HUMAN_SEAT];
  const pot = potTotal(hand);
  const canAgg = l.canBet || l.canRaise;
  const clamp = (v: number) => Math.max(l.minRaiseTo, Math.min(l.maxRaiseTo, Math.round(v)));
  const [amount, setAmount] = useState(l.minRaiseTo);
  useEffect(() => setAmount(l.minRaiseTo), [l.minRaiseTo, hand.street]);
  const sizeTo = (frac: number) => clamp(hand.currentBet + frac * (pot + l.toCall));
  const presets: [string, number][] = [
    ['Min', l.minRaiseTo],
    ['½ pot', sizeTo(0.5)],
    ['¾ pot', sizeTo(0.75)],
    ['Pot', sizeTo(1)],
    ['All-in', l.maxRaiseTo],
  ];
  const aggLabel = l.canBet ? 'Bet' : 'Raise to';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'f' && l.canFold) onAct({ type: 'fold' });
      if (e.key === 'c') onAct(l.canCheck ? { type: 'check' } : { type: 'call' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [l.canFold, l.canCheck, onAct]);

  return (
    <div className="action-bar" role="group" aria-label="Your action">
      {canAgg && (
        <div className="sizing">
          <div className="presets">
            {presets.map(([label, v]) => (
              <button key={label} className={`chip${amount === v ? ' on' : ''}`} onClick={() => setAmount(v)}>
                {label}
              </button>
            ))}
          </div>
          <div className="slider-row">
            <input
              type="range"
              min={l.minRaiseTo}
              max={l.maxRaiseTo}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label="Bet size"
            />
            <input
              type="number"
              className="amount"
              min={l.minRaiseTo}
              max={l.maxRaiseTo}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              onBlur={() => setAmount(clamp(amount))}
              aria-label="Bet amount"
            />
          </div>
        </div>
      )}
      <div className="buttons">
        {l.canFold && (
          <button className="btn act fold" onClick={() => onAct({ type: 'fold' })}>
            Fold <kbd>F</kbd>
          </button>
        )}
        {l.canCheck && (
          <button className="btn act check" onClick={() => onAct({ type: 'check' })}>
            Check <kbd>C</kbd>
          </button>
        )}
        {l.canCall && (
          <button className="btn act call" onClick={() => onAct({ type: 'call' })}>
            Call {num(l.callAmount)}
            {l.callAmount >= me.stack ? ' (all-in)' : ''} <kbd>C</kbd>
          </button>
        )}
        {canAgg && (
          <button className="btn act raise" onClick={() => onAct({ type: l.canBet ? 'bet' : 'raise', amount: clamp(amount) })}>
            {aggLabel} {num(clamp(amount))}
            {clamp(amount) === l.maxRaiseTo ? ' (all-in)' : ''}
          </button>
        )}
      </div>
    </div>
  );
}

/** Live math for the current decision. */
function Hud({ hand }: { hand: HandState }) {
  const me = hand.players[HUMAN_SEAT];
  const l = legalActions(hand, HUMAN_SEAT);
  const pot = potTotal(hand);
  const opponents = hand.players.filter((p, i) => i !== HUMAN_SEAT && !p.out && !p.folded).length;
  const [eq, setEq] = useState<EquityResult | null>(null);
  const key = `${me.hole.join()}|${hand.board.join()}|${opponents}`;
  const randomCombos = useMemo(() => rangeToCombos(fullRange()), []);

  useEffect(() => {
    let alive = true;
    setEq(null);
    compute
      .equity({
        players: [
          { kind: 'hand', cards: [me.hole[0], me.hole[1]] },
          ...Array.from({ length: opponents }, () => ({ kind: 'range' as const, combos: randomCombos })),
        ],
        board: hand.board,
        samples: 20_000,
        maxExactEvaluations: 2_000_000,
        seed: hand.seed,
      })
      .then((r) => alive && setEq(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Recompute only when the cards or number of opponents change.
  }, [key]);

  // A short-stacked call can only win the matched part of each opponent's chips.
  const effPot = winnablePot(hand.players.map((p) => p.totalBet), HUMAN_SEAT, l.callAmount);
  const req = requiredEquity(effPot, l.callAmount);
  const made = hand.board.length >= 3 ? describeScore(evaluate([...me.hole, ...hand.board])) : null;
  return (
    <section className="panel hud" aria-label="Decision math">
      <h3>Decision math</h3>
      <dl>
        {made && (
          <>
            <dt>Your hand</dt>
            <dd>{made}</dd>
          </>
        )}
        <dt>Pot / to call</dt>
        <dd>
          {num(pot)} / {num(l.callAmount)}
        </dd>
        {l.toCall > 0 && (
          <>
            <dt>Pot odds</dt>
            <dd>
              {potOddsRatio(effPot, l.callAmount).toFixed(2)} : 1 <ProvenanceBadge p={{ kind: 'exact', detail: 'pot : call' }} compact />
            </dd>
            <dt>Equity needed</dt>
            <dd>
              <strong>{pct(req)}</strong>{' '}
              <ProvenanceBadge p={{ kind: 'exact', detail: `call / (pot + call) = ${l.callAmount} / ${effPot + l.callAmount}` }} compact />
            </dd>
          </>
        )}
        <dt>Equity vs {opponents} random hand{opponents > 1 ? 's' : ''}</dt>
        <dd>
          {eq ? (
            <>
              <strong className={l.toCall > 0 ? (eq.equity[0] >= req ? 'pos' : 'neg') : ''}>{pct(eq.equity[0])}</strong>{' '}
              <ProvenanceBadge p={eq.provenance} compact />
            </>
          ) : (
            <span className="muted">computing…</span>
          )}
        </dd>
      </dl>
      <p className="muted small">
        Opponents who bet are rarely holding random hands, so this overstates your equity when facing aggression. The Review tab
        recomputes each decision against estimated ranges.
      </p>
    </section>
  );
}

function HandLog({ log, names }: { log: LogEntry[]; names: string[] }) {
  if (!log.length) return <p className="muted small">No hand in progress.</p>;
  return (
    <ol className="hand-log">
      {log.map((e, i) => (
        <li key={i} className={e.kind}>
          {describeLog(e, names)}
        </li>
      ))}
    </ol>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings } = useStore();
  const [s, setS] = useState<TableSettings>(settings);
  const setOpp = (n: number) =>
    setS({
      ...s,
      opponents: Array.from({ length: n }, (_, i) => s.opponents[i] ?? { profileId: BOT_PROFILES[i % BOT_PROFILES.length].id }),
    });
  const restarts = JSON.stringify([s.opponents, s.startingStackBB, s.bigBlind]) !== JSON.stringify([settings.opponents, settings.startingStackBB, settings.bigBlind]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Table settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Table settings</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="form">
          <label>
            Opponents
            <select value={s.opponents.length} onChange={(e) => setOpp(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? '(heads-up)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="opp-list">
            {s.opponents.map((o, i) => (
              <label key={i}>
                Seat {i + 1}
                <select
                  value={o.profileId}
                  onChange={(e) => setS({ ...s, opponents: s.opponents.map((x, k) => (k === i ? { profileId: e.target.value } : x)) })}
                >
                  {BOT_PROFILES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.short}
                    </option>
                  ))}
                </select>
                <small className="muted">{profileById(o.profileId).description}</small>
              </label>
            ))}
          </div>
          <label>
            Starting stack (big blinds)
            <input type="number" min={10} max={1000} value={s.startingStackBB} onChange={(e) => setS({ ...s, startingStackBB: Math.max(10, Number(e.target.value)) })} />
          </label>
          <label>
            Big blind (small blind is half)
            <select value={s.bigBlind} onChange={(e) => setS({ ...s, bigBlind: Number(e.target.value) })}>
              {[2, 10, 20, 100].map((b) => (
                <option key={b} value={b}>{b / 2} / {b}</option>
              ))}
            </select>
          </label>
          <label>
            Computer speed
            <select value={s.botDelayMs} onChange={(e) => setS({ ...s, botDelayMs: Number(e.target.value) })}>
              <option value={150}>Fast</option>
              <option value={650}>Normal</option>
              <option value={1400}>Slow</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.showHud} onChange={(e) => setS({ ...s, showHud: e.target.checked })} /> Show decision math while playing
          </label>
          <label className="check">
            <input type="checkbox" checked={s.showBotCards} onChange={(e) => setS({ ...s, showBotCards: e.target.checked })} /> Study mode: show opponents' cards
          </label>
          <label className="check">
            <input type="checkbox" checked={s.autoReview} onChange={(e) => setS({ ...s, autoReview: e.target.checked })} /> Analyze my decisions after each hand
          </label>
        </div>
        {restarts && <p className="warn-text small">Changing players, stacks or blinds starts a new session.</p>}
        <div className="row gap">
          <button className="btn ghost" onClick={() => setS(DEFAULT_SETTINGS)}>Defaults</button>
          <span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { setSettings(s); onClose(); }}>Apply</button>
        </div>
      </div>
    </div>
  );
}
