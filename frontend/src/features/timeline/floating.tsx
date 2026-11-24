/** What floats near the pointer: facts about a bar, or the new dates while it is dragged. */
import { type RefObject, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { type Day, dayDiff, formatDay, plural } from '@/lib/dates';
import { STATUS_LABEL } from '@/lib/status';
import { hint, spanOf, withDates } from '@/lib/timeline';
import type { TreeItem } from '@/lib/tree';
import { facts } from './bar';
import type { Move } from './use-schedule';

export interface Hover {
  item: TreeItem;
  x: number;
  y: number;
}

const DELAY_MS = 350;
const card =
  'pointer-events-none fixed z-50 max-w-80 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground text-sm shadow-lg';

function near(x: number, y: number): React.CSSProperties {
  const right = x > window.innerWidth - 340;
  const up = y > window.innerHeight - 190;
  return {
    left: right ? undefined : x + 14,
    right: right ? window.innerWidth - x + 14 : undefined,
    top: up ? undefined : y + 18,
    bottom: up ? window.innerHeight - y + 12 : undefined,
  };
}

interface Props {
  tell: RefObject<(hover: Hover | null) => void>;
  move: Move | null;
  /** The panel tells about this row already. */
  selected: string | null;
  today: Day;
}

export function Floating({ tell, move, selected, today }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  useEffect(() => {
    tell.current = setHover;
    const hide = () => setHover(null);
    const events = ['pointerdown', 'keydown', 'wheel', 'blur'] as const;
    for (const name of events) window.addEventListener(name, hide, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, hide);
    };
  }, [tell]);
  // Outside the screen's own containers: they would become the frame for a fixed position.
  return createPortal(
    move?.at ? (
      <NewDates move={move} today={today} />
    ) : hover && !move && hover.item.key !== selected ? (
      <Facts key={hover.item.key} hover={hover} today={today} />
    ) : null,
    document.body,
  );
}

function NewDates({ move, today }: { move: Move; today: Day }) {
  const { item, changes, at } = move;
  if (!at) return null;
  const shown = withDates(item, changes);
  const span = spanOf(shown, today);
  const length = span?.kind === 'bar' && !span.open ? dayDiff(span.end, span.start) + 1 : 0;
  const before = item.dueDate;
  const shift = before && shown.dueDate ? dayDiff(shown.dueDate, before) : 0;
  return (
    <div className={card} style={near(at.x, at.y)}>
      <b className="font-semibold">
        {[shown.startDate, shown.dueDate]
          .flatMap((day) => (day ? formatDay(day, today) : []))
          .join(' – ')}
      </b>
      <span className="text-muted-foreground">
        {length > 0 && `, ${length} ${plural(length, 'день', 'дня', 'дней')}`}
        {shift !== 0 && ` (срок ${shift > 0 ? '+' : '−'}${Math.abs(shift)})`}
      </span>
    </div>
  );
}

function Facts({ hover, today }: { hover: Hover; today: Day }) {
  const { item, x, y } = hover;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!shown) return null;
  const words = hint(item, spanOf(item, today), today);
  const tells = words && (words.bad || item.actualEnd !== null) ? words : null;
  return (
    <div className={card} style={near(x, y)}>
      <p className="font-semibold">{item.title}</p>
      <p className="mt-1 flex items-center gap-1.5">
        <OrbitGlyph
          status={item.status}
          progress={item.progress ?? undefined}
          className="size-3.5"
        />
        {STATUS_LABEL[item.status]}
        {item.progress !== null && `, ${Math.round(item.progress * 100)}%`}
        {tells && <span className={tells.bad ? 'text-danger' : undefined}>· {tells.text}</span>}
      </p>
      {facts(item, today).map((line) => (
        <p key={line} className="text-muted-foreground">
          {line}
        </p>
      ))}
      {item.note && <p className="mt-1.5 text-muted-foreground">{item.note}</p>}
    </div>
  );
}
