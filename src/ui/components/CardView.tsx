import { type Card, RANK_CHARS, SUIT_NAMES, SUIT_SYMBOLS, rankOf, suitOf } from '../../core/cards';

const RANK_LABEL = (r: number) => (RANK_CHARS[r] === 'T' ? '10' : RANK_CHARS[r]);

export function CardView({
  card,
  size = 'md',
  faceDown = false,
  highlight = false,
  dim = false,
}: {
  card?: Card | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  highlight?: boolean;
  dim?: boolean;
}) {
  if (card === undefined || card === null) {
    return <span className={`card card-${size} card-empty`} aria-label="empty card slot" />;
  }
  if (faceDown) return <span className={`card card-${size} card-back`} aria-label="face-down card" />;
  const r = rankOf(card);
  const s = suitOf(card);
  return (
    <span
      className={`card card-${size} suit-${SUIT_NAMES[s]}${highlight ? ' card-hl' : ''}${dim ? ' card-dim' : ''}`}
      aria-label={`${RANK_LABEL(r)} of ${SUIT_NAMES[s]}`}
      role="img"
    >
      <span className="card-rank">{RANK_LABEL(r)}</span>
      <span className="card-suit">{SUIT_SYMBOLS[s]}</span>
    </span>
  );
}

export function CardRow({ cards, size = 'sm', slots = 0 }: { cards: Card[]; size?: 'xs' | 'sm' | 'md' | 'lg'; slots?: number }) {
  const out = [...cards];
  while (out.length < slots) out.push(-1);
  return (
    <span className="card-row">
      {out.map((c, i) => (
        <CardView key={i} card={c < 0 ? null : c} size={size} />
      ))}
    </span>
  );
}
