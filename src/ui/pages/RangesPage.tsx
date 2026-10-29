import { useEffect, useRef, useState } from 'react';
import { PREFLOP_EQUITY_VS_RANDOM } from '../../core/data/preflopEquity';
import { PREFLOP_RANKING_PROVENANCE, RANGE_PRESETS, topPercentRange } from '../../core/presets';
import { countCombos, emptyRange, formatRange, HAND_CLASSES, parseRange, rangePercent, type Range } from '../../core/ranges';
import { load, save } from '../../storage/storage';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { RangeMatrix } from '../components/RangeMatrix';
import { num, pct } from '../format';

export function RangesPage() {
  const [range, setRange] = useState<Range>(() => {
    try {
      return parseRange(load('ranges.current', RANGE_PRESETS[1].text));
    } catch {
      return emptyRange();
    }
  });
  const [text, setText] = useState(() => formatRange(range));
  const [textErr, setTextErr] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [brush, setBrush] = useState(1);
  const [topPct, setTopPct] = useState(20);
  const [presetId, setPresetId] = useState<string>(RANGE_PRESETS[1].id);

  const editingText = useRef(false);
  useEffect(() => {
    const t = formatRange(range);
    if (!editingText.current) setText(t);
    editingText.current = false;
    save('ranges.current', t);
  }, [range]);

  const preset = RANGE_PRESETS.find((p) => p.id === presetId);
  const h = hover !== null ? HAND_CLASSES[hover] : null;
  const counts = { pair: 0, suited: 0, offsuit: 0 };
  for (const c of HAND_CLASSES) counts[c.kind] += range[c.index] * c.combos;

  return (
    <div className="page ranges">
      <header className="page-head">
        <div>
          <h2>Range matrix</h2>
          <p className="muted">
            Press and drag to paint. Pairs on the diagonal, suited hands above it, offsuit below.
          </p>
        </div>
      </header>
      <div className="ranges-grid">
        <section className="panel matrix-panel">
          <RangeMatrix range={range} onChange={setRange} brushWeight={brush} onHover={setHover} highlight={hover} />
          <div className="matrix-legend small muted">
            <span><i className="sw pair" /> pair (6 combos)</span>
            <span><i className="sw suited" /> suited (4)</span>
            <span><i className="sw offsuit" /> offsuit (12)</span>
          </div>
        </section>
        <section className="panel">
          <div className="stat-tiles">
            <div className="tile">
              <div className="tile-num">{num(Math.round(countCombos(range) * 100) / 100)}</div>
              <div className="tile-label">combos of 1,326</div>
            </div>
            <div className="tile">
              <div className="tile-num">{pct(rangePercent(range))}</div>
              <div className="tile-label">of all hands</div>
            </div>
          </div>
          <p className="small muted">
            Pairs {num(counts.pair)} · suited {num(counts.suited)} · offsuit {num(counts.offsuit)} combos
          </p>

          <div className="hover-info" aria-live="polite">
            {h ? (
              <>
                <strong>{h.label}</strong>: {h.combos} combos ({pct(h.combos / 1326, 2)} of hands) · equity vs random hand{' '}
                <strong>{pct(PREFLOP_EQUITY_VS_RANDOM[h.index])}</strong> <ProvenanceBadge p={PREFLOP_RANKING_PROVENANCE} compact />
              </>
            ) : (
              <span className="muted">Hover or focus a cell for details.</span>
            )}
          </div>

          <h3>Brush</h3>
          <div className="seg">
            {[1, 0.5, 0.25].map((w) => (
              <button key={w} className={brush === w ? 'on' : ''} onClick={() => setBrush(w)}>
                {w * 100}%
              </button>
            ))}
          </div>
          <p className="small muted">Partial weights model mixed strategies, e.g. "raise this hand half the time".</p>

          <h3>Top {topPct}% of hands</h3>
          <input type="range" min={1} max={100} value={topPct} onChange={(e) => setTopPct(Number(e.target.value))} aria-label="Top percent of hands" />
          <div className="row gap wrap">
            <button className="btn" onClick={() => setRange(topPercentRange(topPct / 100))}>Select top {topPct}%</button>
            <ProvenanceBadge p={PREFLOP_RANKING_PROVENANCE} />
          </div>

          <h3>Example ranges</h3>
          <div className="row gap wrap">
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)} aria-label="Example range">
              {RANGE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button className="btn" onClick={() => preset && setRange(parseRange(preset.text))}>Load</button>
          </div>
          {preset && (
            <p className="small">
              {preset.description} <ProvenanceBadge p={preset.provenance} />
            </p>
          )}

          <h3>Text notation</h3>
          <textarea
            value={text}
            rows={3}
            onChange={(e) => {
              setText(e.target.value);
              try {
                const r = parseRange(e.target.value);
                setTextErr(null);
                editingText.current = true;
                setRange(r);
              } catch (err) {
                setTextErr((err as Error).message);
              }
            }}
            aria-label="Range in text notation"
          />
          {textErr && <p className="neg small">{textErr}</p>}
          <div className="row gap wrap">
            <button className="btn" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
            <button className="btn ghost" onClick={() => setRange(emptyRange())}>Clear</button>
          </div>
        </section>
      </div>
    </div>
  );
}
