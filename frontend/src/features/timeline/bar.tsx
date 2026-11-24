/** One row as a mark on the time scale: a bar with its name inside, or a point. */
import type { Status } from '@/api/types';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { type Day, formatDate, formatDay } from '@/lib/dates';
import { STATUS_LABEL } from '@/lib/status';
import {
  barBox,
  fits,
  type Grip,
  grips,
  type Hint,
  hint,
  labelWidth,
  pointX,
  type Scale,
  type Span,
} from '@/lib/timeline';
import type { TreeItem } from '@/lib/tree';
import { cn } from '@/lib/utils';
import type { Schedule } from './use-schedule';

const TONE: Record<Status, { body: string; fill: string }> = {
  backlog: { body: 'border-dashed border-idle/70 border-l-idle bg-idle-wash', fill: 'bg-idle' },
  planned: { body: 'border-planned/50 border-l-planned bg-planned-wash', fill: 'bg-planned' },
  in_progress: { body: 'border-sun/60 border-l-sun bg-sun-wash', fill: 'bg-sun' },
  paused: { body: 'border-idle/50 border-l-idle bg-idle-wash', fill: 'bg-idle' },
  blocked: { body: 'border-blocked/50 border-l-blocked bg-blocked-wash', fill: 'bg-blocked' },
  done: { body: 'border-done/35 border-l-done bg-done-wash', fill: 'bg-done' },
  canceled: { body: 'border-idle/35 border-l-idle/60 bg-idle-wash', fill: 'bg-idle' },
};

const POINT: Record<Status, string> = {
  backlog: 'border-idle bg-background',
  planned: 'border-planned bg-planned-wash',
  in_progress: 'border-sun bg-sun-wash',
  paused: 'border-idle bg-idle-wash',
  blocked: 'border-blocked bg-blocked-wash',
  done: 'border-done bg-done',
  canceled: 'border-idle bg-idle-wash',
};

export const BAR_HEIGHT = { project: 28, milestone: 26, task: 22 } as const;
export const LANE_HEIGHT = 26;
export const LANE_STEP = 31;
const POINT_HALF = 9;
/** The status mark inside a bar; the first thing to go when the name needs the room. */
const GLYPH = 20;

/** The mark itself, without words: first and last pixel. */
export function reach(item: TreeItem, span: Span, scale: Scale, today: Day): [number, number] {
  const { left, tail } = geometry(item, span, scale, today);
  return [left, tail];
}

/** Everything a mark takes on the scale, its words included. */
export function extent(
  item: TreeItem,
  span: Span,
  scale: Scale,
  today: Day,
  inLane = false,
): [number, number] {
  const { left, right, tail } = geometry(item, span, scale, today);
  const label = outsideLabel(item, span, right - left, inLane);
  const words = inLane ? null : hint(item, span, today);
  const text = (label ? labelWidth(label) - 22 : 0) + (words ? words.text.length * 6.6 + 8 : 0);
  return [left, tail + (text > 0 ? text + 10 : 0)];
}

function geometry(item: TreeItem, span: Span, scale: Scale, today: Day) {
  const point = span.kind === 'point';
  const box = barBox(span, scale);
  const left = point ? pointX(span, scale) - POINT_HALF : box.left;
  const right = point ? pointX(span, scale) + POINT_HALF : box.left + box.width;
  const lateTo = span.late > 0 ? scale.x(today) + scale.px / 2 : right;
  // The mark of a deadline that differs from the end: only facts have it.
  const due =
    span.due && span.due !== span.end && item.status === 'done'
      ? scale.x(span.due) + scale.px
      : null;
  return { left, right, lateTo, due, tail: Math.max(right, lateTo, due ?? 0) };
}

/** A name that does not fit inside goes to the right; in a lane a part of it is enough. */
function outsideLabel(item: TreeItem, span: Span, width: number, inLane: boolean): string | null {
  if (span.kind === 'point') return item.title;
  if (width >= labelWidth(item.title) - GLYPH) return null;
  return inLane && width >= 72 ? null : item.title;
}

export function spoken(item: TreeItem, span: Span, today: Day): string {
  const parts = [STATUS_LABEL[item.status].toLowerCase()];
  if (item.progress !== null) parts.push(`${Math.round(item.progress * 100)}%`);
  if (span.kind === 'bar') parts.push(`с ${formatDay(span.start, today)}`);
  if (span.due) parts.push(`срок ${formatDay(span.due, today)}`);
  const words = hint(item, span, today);
  if (words && (words.bad || span.delta !== null)) parts.push(words.text);
  return `${item.title}: ${parts.join(', ')}`;
}

interface Props {
  item: TreeItem;
  span: Span;
  scale: Scale;
  today: Day;
  /** Top edge in a folded project; a bar of its own row is centered. */
  top?: number;
  tab: number;
  moving: boolean;
  schedule: Schedule;
  onOpen: (item: TreeItem) => void;
  onHover: (event: React.PointerEvent, item: TreeItem | null) => void;
}

export function Bar(props: Props) {
  const { item, span, scale, today, top, tab, moving, schedule, onOpen, onHover } = props;
  const inLane = top !== undefined;
  const { left, right, lateTo, due } = geometry(item, span, scale, today);
  const point = span.kind === 'point';
  const width = right - left;
  const height = inLane ? LANE_HEIGHT : BAR_HEIGHT[item.entity];
  const allowed = grips(item, span);
  const outside = outsideLabel(item, span, width, inLane);
  const words = inLane ? null : hint(item, span, today);
  const place = inLane ? { top, height } : { top: '50%', height, transform: 'translateY(-50%)' };

  return (
    <>
      {lateTo > right && (
        <div
          aria-hidden="true"
          className="bar-late absolute z-2 rounded-r-md opacity-80"
          style={{
            ...place,
            left: point ? left + POINT_HALF : right - 2,
            width: lateTo - right + (point ? POINT_HALF : 2),
            height: point ? 6 : height - 8,
            top: inLane ? (top ?? 0) + (point ? height / 2 - 3 : 4) : '50%',
          }}
        />
      )}
      {due !== null && <DueMark at={due} end={right} late={(span.delta ?? 0) > 0} place={place} />}
      <div
        className={cn('group/bar absolute z-3', moving && 'z-5')}
        style={{ ...place, left, width }}
        onPointerEnter={(event) => onHover(event, item)}
        onPointerMove={(event) => onHover(event, item)}
        onPointerLeave={(event) => onHover(event, null)}
      >
        {point ? (
          <div
            aria-hidden="true"
            className={cn(
              'absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border-2',
              POINT[item.status],
            )}
          />
        ) : (
          <Body
            item={item}
            span={span}
            moving={moving}
            named={outside === null}
            glyph={fits(item.title, width) || inLane}
          />
        )}
        <button
          type="button"
          tabIndex={tab}
          aria-label={spoken(item, span, today)}
          onPointerDown={(event) =>
            allowed.includes('move') && schedule.drag(event, item, span, 'move')
          }
          onClick={() => !schedule.justDragged() && onOpen(item)}
          className={cn(
            'absolute inset-0 rounded-md',
            allowed.includes('move') && 'cursor-grab active:cursor-grabbing',
            point && '-inset-x-1',
          )}
        />
        {allowed.includes('start') && (
          <Handle side="start" item={item} span={span} schedule={schedule} />
        )}
        {allowed.includes('end') && (
          <Handle side="end" item={item} span={span} schedule={schedule} />
        )}
      </div>
      {(outside || words) && (
        <Words
          left={Math.max(right, lateTo, due ?? 0) + 8}
          place={place}
          title={outside}
          words={words}
          strong={item.entity !== 'task'}
        />
      )}
    </>
  );
}

interface BodyProps {
  item: TreeItem;
  span: Span;
  moving: boolean;
  /** The name is inside. */
  named: boolean;
  glyph: boolean;
}

function Body({ item, span, moving, named, glyph }: BodyProps) {
  const tone = TONE[item.status];
  const closed = item.status === 'done' || item.status === 'canceled';
  return (
    <div
      aria-hidden="true"
      className={cn(
        'absolute inset-0 overflow-clip rounded-md border border-l-[3px] transition-shadow group-hover/bar:shadow-md',
        tone.body,
        span.open && 'bar-open border-r-0',
        moving && 'shadow-lg',
      )}
    >
      {named && (
        <span
          className={cn(
            // Stays in sight while the bar itself goes under the names.
            'sticky left-[calc(var(--names)+0.5rem)] inline-flex h-full max-w-full items-center gap-1.5 px-1.5 align-top',
            item.entity === 'project' && 'font-semibold',
            item.entity === 'task' ? 'text-xs' : 'text-sm',
            item.status === 'canceled' && 'line-through',
            closed && 'text-muted-foreground',
          )}
        >
          {glyph && (
            <OrbitGlyph
              status={item.status}
              progress={item.progress ?? undefined}
              className="size-3.5"
            />
          )}
          <span className="min-w-0 truncate">{item.title}</span>
        </span>
      )}
      {item.progress !== null && item.progress > 0 && !closed && (
        <span
          className={cn('absolute bottom-0 left-0 h-[3px] rounded-r-full', tone.fill)}
          style={{ width: `${item.progress * 100}%` }}
        />
      )}
    </div>
  );
}

interface HandleProps {
  side: Extract<Grip, 'start' | 'end'>;
  item: TreeItem;
  span: Span;
  schedule: Schedule;
}

function Handle({ side, item, span, schedule }: HandleProps) {
  const point = span.kind === 'point';
  return (
    <div
      data-grip={side}
      title={side === 'start' ? 'Старт: потяни' : 'Срок: потяни'}
      onPointerDown={(event) => schedule.drag(event, item, span, side)}
      className={cn(
        'group/grip absolute inset-y-0 grid w-2.5 cursor-ew-resize place-items-center opacity-0 group-hover/bar:opacity-100',
        side === 'start' ? (point ? '-left-3' : '-left-1.5') : '-right-1.5',
      )}
    >
      <span className="h-3.5 w-1 rounded-full bg-foreground/60 group-hover/grip:bg-foreground" />
    </div>
  );
}

type Place = { top: number | string | undefined; height: number; transform?: string };

function DueMark(props: { at: number; end: number; late: boolean; place: Place }) {
  const { at, end, late, place } = props;
  return (
    <div aria-hidden="true">
      {at > end && (
        <div
          className="absolute z-2 h-0 border-done border-t border-dashed"
          style={{
            left: end,
            width: at - end,
            top: place.top === '50%' ? '50%' : Number(place.top) + place.height / 2,
          }}
        />
      )}
      <div
        className={cn('absolute z-4 w-0.5 rounded-full', late ? 'bg-danger' : 'bg-done')}
        style={{ ...place, left: at - 1 }}
      />
    </div>
  );
}

interface WordsProps {
  left: number;
  place: Place;
  title: string | null;
  words: Hint | null;
  strong: boolean;
}

function Words({ left, place, title, words, strong }: WordsProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-2 flex items-center gap-2 whitespace-nowrap text-xs"
      style={{ ...place, left }}
    >
      {title && <span className={cn(strong ? 'text-sm' : 'text-xs')}>{title}</span>}
      {words && (
        <span className={words.bad ? 'font-medium text-danger' : 'text-muted-foreground'}>
          {words.text}
        </span>
      )}
    </div>
  );
}

/** Deadline of a folded project, whose own bar gives way to its milestones. */
export function ProjectRail(props: { span: Span; scale: Scale; today: Day; bottom: number }) {
  const { span, scale, today, bottom } = props;
  const { left, width } = barBox(span, scale);
  return (
    <div aria-hidden="true">
      {span.kind === 'bar' && (
        <div
          className={cn('absolute z-1 h-[3px] rounded-full bg-input', span.open && 'bar-open')}
          style={{ left, width, bottom }}
        />
      )}
      {span.due && (
        <div
          className="absolute z-3 flex items-center gap-1.5 whitespace-nowrap text-muted-foreground text-xs"
          style={{ left: scale.x(span.due) + scale.px - 4, bottom: bottom - 5 }}
        >
          <span className="size-2 rotate-45 rounded-[2px] bg-foreground" />
          {formatDay(span.due, today)}
        </div>
      )}
    </div>
  );
}

/** Facts for the floating hint. */
export function facts(item: TreeItem, today: Day): string[] {
  const lines: string[] = [];
  if (item.startDate) lines.push(`Старт: ${formatDate(item.startDate)}`);
  else if (item.actualStart) lines.push(`Начато: ${formatDate(item.actualStart)} (по журналу)`);
  if (item.dueDate) lines.push(`Срок: ${formatDate(item.dueDate)}`);
  if (item.actualEnd) {
    const word = item.status === 'canceled' ? 'Отменено' : 'Закрыто';
    lines.push(`${word}: ${formatDay(item.actualEnd, today)}`);
  }
  return lines;
}
