import { useState, type ReactNode } from 'react';
import { choose, probHitAtLeastOne, ruleOf2And4 } from '../../core/combinatorics';
import {
  bluffToValueRatio, breakevenFoldFrequency, evBet, evCall, minimumDefenseFrequency, optimalBluffFraction, potOddsRatio,
  requiredEquity,
} from '../../core/ev';
import type { Provenance } from '../../core/provenance';
import type { CfrResult } from '../../solver/cfr';
import { KUHN_GAME_VALUE, KUHN_INFOSET_LABELS } from '../../solver/kuhn';
import { compute } from '../../workers/client';
import { LineChart } from '../components/LineChart';
import { ProvenanceBadge, ProvenanceLegend } from '../components/ProvenanceBadge';
import { pct, signed } from '../format';

const EXACT_FORMULA: Provenance = { kind: 'exact', detail: 'Closed-form formula.' };

function Lesson({ id, title, children, open = false }: { id: string; title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="panel lesson" id={id} open={open}>
      <summary>
        <h3>{title}</h3>
      </summary>
      <div className="lesson-body">{children}</div>
    </details>
  );
}

function Num({ label, value, onChange, min = 0, max = 10000, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="num">
      {label}
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))} />
    </label>
  );
}

export function LearnPage() {
  return (
    <div className="page learn">
      <header className="page-head">
        <div>
          <h2>Learn the math</h2>
          <p className="muted">Short lessons with live calculators. Change the numbers and watch the formulas respond.</p>
        </div>
      </header>
      <Lesson id="provenance" title="0 · Where do the numbers come from?" open>
        <p>
          Every number in this app is labelled. The distinction matters: an <em>exact</em> answer is true given its assumptions, a
          <em> Monte Carlo</em> estimate has random error, a <em>heuristic</em> is a rule of thumb, and only output of an actual
          equilibrium solver is called <em>solver-derived</em> (what people loosely call "GTO").
        </p>
        <ProvenanceLegend />
      </Lesson>
      <PotOddsLesson />
      <EvLesson />
      <CombosLesson />
      <BluffLesson />
      <RangeLesson />
      <CfrLesson />
    </div>
  );
}

function PotOddsLesson() {
  const [pot, setPot] = useState(100);
  const [bet, setBet] = useState(50);
  const total = pot + bet;
  const req = requiredEquity(total, bet);
  return (
    <Lesson id="pot-odds" title="1 · Pot odds">
      <p>
        When you call, you risk the call to win everything already in the pot (including your opponent's bet). You break even
        when your share of the final pot equals your share of the money put in.
      </p>
      <div className="calc">
        <Num label="Pot before the bet" value={pot} onChange={setPot} />
        <Num label="Opponent bets" value={bet} onChange={setBet} min={1} />
      </div>
      <table className="steps">
        <tbody>
          <tr><th>Pot you can win</th><td>{total} <code>pot + bet</code></td></tr>
          <tr><th>Pot odds</th><td>{potOddsRatio(total, bet).toFixed(2)} : 1</td></tr>
          <tr>
            <th>Equity needed</th>
            <td>
              <strong>{pct(req)}</strong> <code>call / (pot + bet + call) = {bet} / {total + bet}</code> <ProvenanceBadge p={EXACT_FORMULA} compact />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="small muted">
        Common sizes: ⅓ pot → 20% · ½ pot → 25% · ⅔ pot → 28.6% · pot → 33.3% · 2× pot → 40%.
      </p>
    </Lesson>
  );
}

function EvLesson() {
  const [eq, setEq] = useState(30);
  const [pot, setPot] = useState(150);
  const [call, setCall] = useState(50);
  const [fold, setFold] = useState(40);
  const [bet, setBet] = useState(75);
  const [eqCalled, setEqCalled] = useState(20);
  const e = eq / 100;
  return (
    <Lesson id="ev" title="2 · Expected value">
      <p>
        EV is the average result of a decision if you could repeat it forever. Folding is our zero point: chips already in the pot
        are no longer yours, so they are not "lost" by folding.
      </p>
      <h4>Calling</h4>
      <div className="calc">
        <Num label="Your equity (%)" value={eq} onChange={setEq} max={100} />
        <Num label="Pot (incl. bet)" value={pot} onChange={setPot} />
        <Num label="To call" value={call} onChange={setCall} />
      </div>
      <p>
        EV(call) = {e.toFixed(2)} × {pot} − {(1 - e).toFixed(2)} × {call} = <strong className={evCall(e, pot, call) >= 0 ? 'pos' : 'neg'}>{signed(evCall(e, pot, call), 2)} chips</strong>{' '}
        <ProvenanceBadge p={EXACT_FORMULA} compact />
      </p>
      <h4>Betting (fold equity)</h4>
      <div className="calc">
        <Num label="Pot" value={pot} onChange={setPot} />
        <Num label="Your bet" value={bet} onChange={setBet} />
        <Num label="Villain folds (%)" value={fold} onChange={setFold} max={100} />
        <Num label="Equity when called (%)" value={eqCalled} onChange={setEqCalled} max={100} />
      </div>
      <p>
        EV(bet) = P(fold)·pot + P(call)·[eq·(pot + bet) − (1 − eq)·bet] ={' '}
        <strong className={evBet(pot, bet, fold / 100, eqCalled / 100) >= 0 ? 'pos' : 'neg'}>{signed(evBet(pot, bet, fold / 100, eqCalled / 100), 2)} chips</strong>
      </p>
      <p className="small muted">
        Assumption in both formulas: no more betting after this decision. Later streets add implied odds (you win more when you
        hit) and reverse implied odds (you lose more when you are second-best).
      </p>
    </Lesson>
  );
}

function CombosLesson() {
  const [outs, setOuts] = useState(9);
  return (
    <Lesson id="combos" title="3 · Combinatorics and outs">
      <p>
        There are C(52, 2) = <strong>{choose(52, 2)}</strong> starting hands. A pocket pair has C(4, 2) = 6 combinations, a suited
        hand 4, an offsuit hand 12 — so AK (16 combos) is more than twice as likely as AA (6).
      </p>
      <p>
        <strong>Card removal:</strong> every card you can see removes combos. With an ace on the board, AA has C(3, 2) = 3 combos
        left and AK has 3 × 4 = 12.
      </p>
      <h4>Drawing odds</h4>
      <div className="calc">
        <Num label="Outs" value={outs} onChange={setOuts} max={30} />
      </div>
      <table className="data">
        <thead>
          <tr><th></th><th>Exact</th><th>Rule of 2 / 4</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Turn → river (1 card, 46 unseen)</td>
            <td>{pct(probHitAtLeastOne(outs, 46, 1))}</td>
            <td>{pct(ruleOf2And4(outs, 1))}</td>
          </tr>
          <tr>
            <td>Flop → river (2 cards, 47 unseen)</td>
            <td>{pct(probHitAtLeastOne(outs, 47, 2))}</td>
            <td>{pct(ruleOf2And4(outs, 2))}</td>
          </tr>
        </tbody>
      </table>
      <p className="small">
        Exact: 1 − C(unseen − outs, k) / C(unseen, k) <ProvenanceBadge p={EXACT_FORMULA} compact /> · Rule of 2/4:{' '}
        <ProvenanceBadge p={{ kind: 'heuristic', detail: 'Linear approximation; overestimates with many outs.' }} compact /> — it
        drifts high with many outs (try 15).
      </p>
    </Lesson>
  );
}

function BluffLesson() {
  const [pot, setPot] = useState(100);
  const [bet, setBet] = useState(75);
  const rows = [0.33, 0.5, 0.75, 1, 1.5, 2].map((f) => ({ f, b: f * 100 }));
  const toyGame: Provenance = {
    kind: 'exact',
    detail: 'Exact equilibrium of the simplified polarized river game — not a solution of full Hold\'em.',
  };
  return (
    <Lesson id="bluffing" title="4 · Bluffing frequencies">
      <div className="calc">
        <Num label="Pot" value={pot} onChange={setPot} min={1} />
        <Num label="Bet" value={bet} onChange={setBet} min={1} />
      </div>
      <table className="steps">
        <tbody>
          <tr>
            <th>Break-even fold % for a pure bluff</th>
            <td><strong>{pct(breakevenFoldFrequency(pot, bet))}</strong> <code>bet / (pot + bet)</code></td>
          </tr>
          <tr>
            <th>Minimum defense frequency</th>
            <td><strong>{pct(minimumDefenseFrequency(pot, bet))}</strong> <code>pot / (pot + bet)</code></td>
          </tr>
          <tr>
            <th>Balanced bluff share of betting range</th>
            <td>
              <strong>{pct(optimalBluffFraction(pot, bet))}</strong> <code>bet / (pot + 2·bet)</code> <ProvenanceBadge p={toyGame} compact />
            </td>
          </tr>
          <tr>
            <th>Bluffs per value bet</th>
            <td>{bluffToValueRatio(pot, bet).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>The toy game:</strong> on the river you hold either the nuts or nothing; your opponent holds a hand that beats only
        bluffs. If you bluff with exactly the balanced share, calling and folding have the same EV for them, so they cannot exploit
        you. Bigger bets support more bluffs — but need more folds.
      </p>
      <table className="data">
        <thead>
          <tr><th>Bet (pot = 100)</th><th>Needs folds</th><th>MDF</th><th>Balanced bluffs</th></tr>
        </thead>
        <tbody>
          {rows.map(({ f, b }) => (
            <tr key={f}>
              <td>{b.toFixed(0)}</td>
              <td>{pct(breakevenFoldFrequency(100, b), 0)}</td>
              <td>{pct(minimumDefenseFrequency(100, b), 0)}</td>
              <td>{pct(optimalBluffFraction(100, b), 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Lesson>
  );
}

function RangeLesson() {
  return (
    <Lesson id="ranges" title="5 · Thinking in ranges">
      <p>
        You never know an opponent's exact cards, so assign them a <em>range</em> — every hand they could hold, weighted by how
        likely they are to play it this way — and narrow it with each action:
      </p>
      <ol>
        <li><strong>Preflop action</strong>: a raise from early position is far narrower than a big-blind check.</li>
        <li><strong>Board texture</strong>: which parts of that range hit this flop?</li>
        <li><strong>Bet sizing and line</strong>: large bets are usually polarized (very strong or bluffs).</li>
        <li><strong>Player type</strong>: a Rock's river raise and a Maniac's mean very different things.</li>
      </ol>
      <p>
        Then compute your equity <em>against the range</em>, not against one hand. The Review tab does exactly this for every
        decision you make at the table, using simple estimation rules{' '}
        <ProvenanceBadge p={{ kind: 'heuristic', detail: 'Rule-based range estimation from observed actions.' }} compact />. Try
        the Range matrix and Equity calculator to explore how ranges interact.
      </p>
    </Lesson>
  );
}

type KuhnRun = CfrResult & { curve: { iteration: number; exploitability: number }[] };

function CfrLesson() {
  const [iters, setIters] = useState(2000);
  const [variant, setVariant] = useState<'CFR' | 'CFR+'>('CFR+');
  const [res, setRes] = useState<KuhnRun | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    setBusy(true);
    compute.kuhn(iters, variant).then(setRes).finally(() => setBusy(false));
  };
  const keys = res ? Object.keys(res.average).sort((a, b) => a.split(':')[1].length - b.split(':')[1].length || a.localeCompare(b)) : [];
  return (
    <Lesson id="cfr" title="6 · Game theory: solving a poker game with CFR">
      <p>
        A <strong>Nash equilibrium</strong> ("GTO") strategy cannot be exploited: no opponent strategy wins against it on average.
        Real Hold'em is too large to solve here, so we solve <strong>Kuhn poker</strong> — three cards (J, Q, K), one card each,
        one bet size — with <strong>Counterfactual Regret Minimization</strong>. CFR plays the game against itself, tracks how
        much it "regrets" not taking each action, and shifts toward actions with positive regret. The <em>average</em> strategy
        converges to equilibrium.
      </p>
      <div className="calc">
        <label className="num">
          Iterations
          <select value={iters} onChange={(e) => setIters(Number(e.target.value))}>
            {[100, 500, 2000, 10000].map((n) => <option key={n} value={n}>{n.toLocaleString('en-US')}</option>)}
          </select>
        </label>
        <label className="num">
          Algorithm
          <select value={variant} onChange={(e) => setVariant(e.target.value as 'CFR' | 'CFR+')}>
            <option value="CFR+">CFR+</option>
            <option value="CFR">Vanilla CFR</option>
          </select>
        </label>
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Solving…' : 'Run solver'}</button>
      </div>
      {res && (
        <>
          <p>
            <ProvenanceBadge p={res.provenance} /> Game value for player 1: <strong>{res.gameValue.toFixed(4)}</strong> (theory:{' '}
            {KUHN_GAME_VALUE.toFixed(4)} = −1/18). Exploitability: <strong>{res.exploitability.toExponential(2)}</strong> chips/hand.
          </p>
          <h4>Exploitability vs. iterations (log scale)</h4>
          <LineChart
            points={res.curve.map((c) => ({ x: c.iteration, y: Math.max(c.exploitability, 1e-6) }))}
            logY
            yFormat={(v) => v.toExponential(0)}
            xLabel="iteration"
            ariaLabel="Exploitability falling as CFR iterates"
          />
          <table className="data">
            <thead>
              <tr><th>Player</th><th>Card</th><th>Situation</th><th>Check / fold</th><th>Bet / call</th></tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const [card, hist] = k.split(':');
                const s = res.average[k];
                const player = hist.length % 2 === 0 ? 1 : 2;
                return (
                  <tr key={k}>
                    <td>P{player}</td>
                    <td><strong>{card}</strong></td>
                    <td>{KUHN_INFOSET_LABELS[hist]}</td>
                    <td>{pct(s.p, 0)}</td>
                    <td>{pct(s.b, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small">
            What to notice: P1 bluffs the Jack some fraction α of the time and value-bets the King 3α — a whole family of
            equilibria. P2 bluffs a Jack ⅓ of the time after a check and calls a bet with a Queen ⅓ of the time: precisely the
            indifference frequencies from lesson 4.
          </p>
        </>
      )}
      <p className="small muted">
        The same <code>ExtensiveGame</code> interface and solver will power future Hold'em subgame solvers. Only output like this —
        from a solver, with exploitability reported — is labelled solver-derived in this app.
      </p>
    </Lesson>
  );
}
