import { useMemo, useState } from 'react';
import { REVIEW_PROVENANCE, type StoredHand, type Verdict } from '../../review/analysis';
import { drillStats, handStats, rolling } from '../../review/progress';
import { DRILL_INFO, type DrillKind } from '../../trainer/drills';
import { compute } from '../../workers/client';
import { CardRow } from '../components/CardView';
import { LineChart } from '../components/LineChart';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { describeLog, num, pct, prettyCards, signed } from '../format';
import { useStore } from '../store';

const VERDICT_LABEL: Record<Verdict, string> = { good: '✓ Good', close: '≈ Close', mistake: '✗ Likely mistake', info: 'ℹ Info' };

export function ReviewPage() {
  const { hands, drills, setReview, clearHands, clearDrills } = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'hands' | 'progress'>('hands');
  const ordered = useMemo(() => [...hands].reverse(), [hands]);
  const hand = hands.find((h) => h.id === selected) ?? ordered[0];

  const analyzeAll = async () => {
    setBusy(true);
    for (const h of hands.filter((x) => !x.review)) {
      try {
        setReview(h.id, await compute.review(h));
      } catch {
        /* skip */
      }
    }
    setBusy(false);
  };

  return (
    <div className="page review">
      <header className="page-head">
        <div>
          <h2>Review & progress</h2>
          <p className="muted">
            Each of your call/fold decisions is compared with the equity you needed, against opponent ranges estimated from their
            actions. <ProvenanceBadge p={REVIEW_PROVENANCE} />
          </p>
        </div>
      </header>
      <nav className="tabs">
        <button className={`tab${tab === 'hands' ? ' on' : ''}`} onClick={() => setTab('hands')}>Hand history ({hands.length})</button>
        <button className={`tab${tab === 'progress' ? ' on' : ''}`} onClick={() => setTab('progress')}>Progress</button>
      </nav>

      {tab === 'progress' ? (
        <Progress />
      ) : hands.length === 0 ? (
        <p className="muted">No hands yet. Play some hands at the table and they will appear here.</p>
      ) : (
        <div className="review-grid">
          <section className="panel hand-list">
            <div className="row gap wrap">
              <button className="btn small" onClick={analyzeAll} disabled={busy || hands.every((h) => h.review)}>
                {busy ? 'Analyzing…' : 'Analyze all'}
              </button>
              <button className="btn small ghost" onClick={() => confirm('Delete all stored hands?') && clearHands()}>Clear</button>
              {drills.length > 0 && (
                <button className="btn small ghost" onClick={() => confirm('Delete all trainer results?') && clearDrills()}>Clear drills</button>
              )}
            </div>
            <ol>
              {ordered.map((h) => {
                const net = h.net[h.humanSeat] / h.config.bigBlind;
                return (
                  <li key={h.id}>
                    <button className={`hand-item${hand?.id === h.id ? ' on' : ''}`} onClick={() => setSelected(h.id)}>
                      <span className="hn">#{h.handNumber}</span>
                      <CardRow cards={h.players[h.humanSeat].hole} size="xs" />
                      <span className={net > 0 ? 'pos' : net < 0 ? 'neg' : 'muted'}>{signed(net)} BB</span>
                      {h.review ? (
                        h.review.mistakes > 0 ? <span className="badge bad">{h.review.mistakes} ✗</span> : <span className="badge good">✓</span>
                      ) : (
                        <span className="badge">–</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
          {hand && <HandDetail hand={hand} />}
        </div>
      )}
    </div>
  );
}

function HandDetail({ hand }: { hand: StoredHand }) {
  const { setReview } = useStore();
  const [busy, setBusy] = useState(false);
  const names = hand.players.map((p) => p.name);
  const decisionsByLog = new Map(hand.review?.decisions.map((d) => [d.logIndex, d]) ?? []);
  return (
    <section className="panel hand-detail">
      <h3>
        Hand #{hand.handNumber} <span className="muted small">{new Date(hand.timestamp).toLocaleString()}</span>
      </h3>
      <div className="row gap wrap">
        <div>
          <div className="label">Your cards</div>
          <CardRow cards={hand.players[hand.humanSeat].hole} size="md" />
        </div>
        <div>
          <div className="label">Board</div>
          <CardRow cards={hand.board} size="md" slots={5} />
        </div>
      </div>
      {hand.showdown && (
        <p className="small">
          Showdown:{' '}
          {hand.players
            .map((p, i) => (hand.descriptions[i] ? `${p.name} ${prettyCards(p.hole)} (${hand.descriptions[i]})` : null))
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {!hand.review && (
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            compute.review(hand).then((r) => setReview(hand.id, r)).finally(() => setBusy(false));
          }}
        >
          {busy ? 'Analyzing…' : 'Analyze my decisions'}
        </button>
      )}
      {hand.review && (
        <p>
          {hand.review.decisions.length} decisions · <strong>{hand.review.mistakes}</strong> likely mistake
          {hand.review.mistakes === 1 ? '' : 's'}
          {hand.review.evLossBB > 0 && <> · est. cost {hand.review.evLossBB.toFixed(2)} BB</>}
        </p>
      )}
      <ol className="replay">
        {hand.log.map((e, i) => {
          const d = decisionsByLog.get(i);
          return (
            <li key={i} className={`${e.kind}${d ? ' mine' : ''}`}>
              <div>{describeLog(e, names)}</div>
              {d && (
                <div className={`decision ${d.verdict}`}>
                  <div className="decision-head">
                    <span className="verdict">{VERDICT_LABEL[d.verdict]}</span>
                    {d.evLossBB > 0 && <span className="neg">−{d.evLossBB.toFixed(2)} BB</span>}
                  </div>
                  <p>{d.note}</p>
                  <dl className="mini">
                    {d.toCall > 0 && (
                      <>
                        <dt>Needed</dt>
                        <dd>
                          {pct(d.required)} <span className="muted">({d.toCall} / {d.pot + d.toCall})</span>
                        </dd>
                        <dt>EV(call)</dt>
                        <dd>{signed(d.evCall / hand.config.bigBlind, 2)} BB</dd>
                      </>
                    )}
                    <dt>Equity</dt>
                    <dd>
                      {pct(d.equity)} <ProvenanceBadge p={d.equityProvenance} compact />
                    </dd>
                  </dl>
                  <details>
                    <summary>Estimated opponent ranges</summary>
                    <ul className="small">
                      {d.opponents.map((o) => (
                        <li key={o.seat}>
                          <strong>{o.name}</strong>: {o.reason} → top {pct(o.fraction, 0)} <code className="range-text">{o.rangeText}</code>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Progress() {
  const { hands, drills } = useStore();
  const hs = handStats(hands);
  const kinds = Object.keys(DRILL_INFO) as DrillKind[];
  const ds = drillStats(drills, kinds);
  const drillTrend = rolling(drills.map((d) => (d.correct ? 1 : 0)), 20);
  return (
    <div className="progress">
      <div className="stat-tiles">
        <div className="tile">
          <div className="tile-num">{num(hs.hands)}</div>
          <div className="tile-label">hands played</div>
        </div>
        <div className="tile">
          <div className="tile-num">{signed(hs.netBB, 1)}</div>
          <div className="tile-label">net big blinds (simulated)</div>
        </div>
        <div className="tile">
          <div className="tile-num">{hs.decisions ? pct(hs.mistakes / hs.decisions, 0) : '–'}</div>
          <div className="tile-label">decisions flagged</div>
        </div>
        <div className="tile">
          <div className="tile-num">{hs.reviewed ? hs.evLossBBPer100.toFixed(1) : '–'}</div>
          <div className="tile-label">est. BB lost to mistakes / 100 hands</div>
        </div>
      </div>

      <section className="panel">
        <h3>Mistake rate per reviewed hand (rolling 25)</h3>
        <LineChart
          points={hs.mistakeTrend.map((p) => ({ x: p.index, y: p.value }))}
          yFormat={(v) => pct(v, 0)}
          xLabel="hand"
          ariaLabel="Rolling mistake rate"
        />
        <p className="muted small">Lower is better. Flags are heuristic — see the badge at the top of this page.</p>
      </section>

      <section className="panel">
        <h3>Trainer accuracy (rolling 20)</h3>
        <LineChart points={drillTrend.map((p) => ({ x: p.index, y: p.value }))} yFormat={(v) => pct(v, 0)} xLabel="drill" ariaLabel="Rolling trainer accuracy" />
        <table className="data">
          <thead>
            <tr>
              <th>Drill</th>
              <th>Attempts</th>
              <th>Accuracy</th>
              <th>Last 20</th>
            </tr>
          </thead>
          <tbody>
            {ds.map((d) => (
              <tr key={d.kind}>
                <td>{DRILL_INFO[d.kind].title}</td>
                <td>{d.attempts}</td>
                <td>{d.attempts ? pct(d.accuracy, 0) : '–'}</td>
                <td>{d.attempts ? pct(d.recentAccuracy, 0) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h3>Cumulative result (big blinds)</h3>
        <LineChart points={hs.netTrend.map((p) => ({ x: p.index, y: p.value }))} yFormat={(v) => v.toFixed(0)} xLabel="hand" ariaLabel="Cumulative net big blinds" refLine={{ y: 0, label: 'break-even' }} />
        <p className="muted small">Short-term results are dominated by luck; the mistake rate is the better measure of improvement.</p>
      </section>
    </div>
  );
}
