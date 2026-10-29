import { useState } from 'react';

export interface Point {
  x: number;
  y: number;
}

/** Minimal single-series SVG line chart with a hover crosshair and tooltip. */
export function LineChart({
  points,
  height = 160,
  yFormat = (v) => v.toFixed(2),
  xLabel,
  logY = false,
  refLine,
  ariaLabel,
}: {
  points: Point[];
  height?: number;
  yFormat?: (v: number) => string;
  xLabel?: string;
  logY?: boolean;
  refLine?: { y: number; label: string };
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className="muted small">Not enough data yet — keep going.</p>;
  const W = 600;
  const H = height;
  const pad = { l: 48, r: 12, t: 10, b: 24 };
  const tf = (v: number) => (logY ? Math.log10(Math.max(v, 1e-9)) : v);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => tf(p.y)).concat(refLine ? [tf(refLine.y)] : []);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const padY = (y1 - y0) * 0.08;
  y0 -= padY;
  y1 += padY;
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (tf(y) - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const ticks = [0, 0.5, 1].map((t) => y0 + t * (y1 - y0));
  const untf = (v: number) => (logY ? 10 ** v : v);
  const hp = hover !== null ? points[hover] : null;

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          let best = 0;
          points.forEach((p, i) => {
            if (Math.abs(sx(p.x) - x) < Math.abs(sx(points[best].x) - x)) best = i;
          });
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(untf(t))} y2={sy(untf(t))} className="grid" />
            <text x={pad.l - 6} y={sy(untf(t)) + 4} className="axis" textAnchor="end">
              {yFormat(untf(t))}
            </text>
          </g>
        ))}
        {refLine && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={sy(refLine.y)} y2={sy(refLine.y)} className="ref" />
            <text x={W - pad.r} y={sy(refLine.y) - 4} className="axis" textAnchor="end">
              {refLine.label}
            </text>
          </g>
        )}
        <text x={W - pad.r} y={H - 6} className="axis" textAnchor="end">
          {xLabel}
        </text>
        <path d={d} className="series" />
        {hp && (
          <g>
            <line x1={sx(hp.x)} x2={sx(hp.x)} y1={pad.t} y2={H - pad.b} className="crosshair" />
            <circle cx={sx(hp.x)} cy={sy(hp.y)} r={4} className="dot" />
          </g>
        )}
      </svg>
      {hp && (
        <figcaption className="chart-tip">
          {xLabel ?? 'x'} {hp.x}: <strong>{yFormat(hp.y)}</strong>
        </figcaption>
      )}
    </figure>
  );
}
