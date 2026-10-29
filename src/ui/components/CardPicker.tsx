import { type Card, makeCard, RANK_CHARS, SUIT_NAMES, SUIT_SYMBOLS } from '../../core/cards';

/** 4×13 grid for choosing a card. Cards in `disabled` are already in use elsewhere. */
export function CardPicker({
  disabled,
  selected,
  onPick,
  onClose,
  title = 'Choose a card',
}: {
  disabled: Set<Card>;
  selected?: Card | null;
  onPick: (c: Card | null) => void;
  onClose: () => void;
  title?: string;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="picker-grid">
          {[3, 2, 1, 0].map((s) => (
            <div className="picker-row" key={s}>
              {Array.from({ length: 13 }, (_, k) => 12 - k).map((r) => {
                const c = makeCard(r, s);
                const isDisabled = disabled.has(c) && c !== selected;
                return (
                  <button
                    key={c}
                    className={`pick suit-${SUIT_NAMES[s]}${c === selected ? ' on' : ''}`}
                    disabled={isDisabled}
                    onClick={() => onPick(c)}
                    aria-label={`${RANK_CHARS[r]} of ${SUIT_NAMES[s]}`}
                  >
                    {RANK_CHARS[r]}
                    <small>{SUIT_SYMBOLS[s]}</small>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="row gap">
          <button className="btn" onClick={() => onPick(null)}>Clear slot</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
