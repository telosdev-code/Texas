import { useRef } from 'react';
import { HAND_CLASSES, type Range } from '../../core/ranges';

/**
 * Interactive 13×13 starting-hand matrix. Press and drag to paint; the first cell decides
 * whether the stroke adds (with `brushWeight`) or erases.
 */
export function RangeMatrix({
  range,
  onChange,
  brushWeight = 1,
  readOnly = false,
  onHover,
  highlight,
  compact = false,
}: {
  range: Range;
  onChange?: (r: Range) => void;
  brushWeight?: number;
  readOnly?: boolean;
  onHover?: (index: number | null) => void;
  highlight?: number | null;
  compact?: boolean;
}) {
  const painting = useRef<{ value: number; current: Range } | null>(null);

  const paint = (idx: number) => {
    const p = painting.current;
    if (!p || p.current[idx] === p.value) return;
    const next = new Float64Array(p.current);
    next[idx] = p.value;
    p.current = next;
    onChange?.(next);
  };

  const start = (idx: number, e: React.PointerEvent) => {
    if (readOnly) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    painting.current = { value: range[idx] === brushWeight ? 0 : brushWeight, current: range };
    paint(idx);
  };

  const cellAt = (e: React.PointerEvent): number | null => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const v = el?.closest<HTMLElement>('[data-idx]')?.dataset.idx;
    return v === undefined ? null : Number(v);
  };

  return (
    <div
      className={`matrix${compact ? ' compact' : ''}${readOnly ? ' ro' : ''}`}
      role="grid"
      aria-label="Starting hand range matrix"
      onPointerMove={(e) => {
        const idx = cellAt(e);
        if (painting.current && idx !== null) paint(idx);
        onHover?.(idx);
      }}
      onPointerUp={() => (painting.current = null)}
      onPointerLeave={() => {
        painting.current = null;
        onHover?.(null);
      }}
    >
      {HAND_CLASSES.map((h) => {
        const w = range[h.index];
        return (
          <button
            type="button"
            key={h.index}
            data-idx={h.index}
            className={`cell ${h.kind}${w > 0 ? ' on' : ''}${highlight === h.index ? ' hl' : ''}`}
            style={w > 0 && w < 1 ? ({ '--w': `${w * 100}%` } as React.CSSProperties) : undefined}
            onPointerDown={(e) => start(h.index, e)}
            onKeyDown={(e) => {
              if (readOnly || (e.key !== 'Enter' && e.key !== ' ')) return;
              e.preventDefault();
              const next = new Float64Array(range);
              next[h.index] = range[h.index] === brushWeight ? 0 : brushWeight;
              onChange?.(next);
            }}
            onFocus={() => onHover?.(h.index)}
            aria-pressed={w > 0}
            aria-label={`${h.label}${w > 0 ? `, in range at ${Math.round(w * 100)}%` : ''}`}
            tabIndex={readOnly ? -1 : 0}
          >
            {h.label}
          </button>
        );
      })}
    </div>
  );
}
