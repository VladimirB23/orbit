/** The timeline as numbers: what to draw for a row, where, and what dragging changes. No React. */
import { addDays, type Day, dayDiff, dueHint, formatDay, MONTHS, plural, toDate } from './dates';
import { isClosed } from './status';
import type { TreeItem } from './tree';

// --- what a row looks like in time -------------------------------------------

export interface Span {
  /** A point is a row with only one known date. */
  kind: 'bar' | 'point';
  /** First and last day, both included. */
  start: Day;
  end: Day;
  due: Day | null;
  /** No deadline: the bar goes on. */
  open: boolean;
  /** Days after a missed deadline, up to today. */
  late: number;
  /** A finished row: days after (+) or before (-) its deadline. */
  delta: number | null;
}

const latest = (a: Day, b: Day): Day => (a > b ? a : b);
const earliest = (a: Day, b: Day): Day => (a < b ? a : b);

/** A start set by a person wins over the one from the journal. */
const startOf = (item: TreeItem): Day | null => item.startDate ?? item.actualStart;

export function spanOf(item: TreeItem, today: Day): Span | null {
  const start = startOf(item);
  const due = item.dueDate;
  const base = { due, open: false, late: 0, delta: null };

  if (isClosed(item.status)) {
    const end = item.actualEnd ?? due;
    if (!end) return null;
    const delta = due && item.status === 'done' ? dayDiff(end, due) : null;
    return start && start <= end
      ? { ...base, kind: 'bar', start, end, delta }
      : { ...base, kind: 'point', start: end, end, delta };
  }
  if (due) {
    const late = Math.max(0, dayDiff(today, due));
    // A start after the deadline (work began too late) cannot be a bar.
    return start && start <= due
      ? { ...base, kind: 'bar', start, end: due, late }
      : { ...base, kind: 'point', start: due, end: due, late };
  }
  if (!start) return null;
  return { ...base, kind: 'bar', start, end: latest(start, today), open: true };
}

export interface Hint {
  text: string;
  bad: boolean;
}

/** A few words next to the bar: the deadline, the delay or the result. */
export function hint(item: TreeItem, span: Span | null, today: Day): Hint | null {
  if (!span) return null;
  if (item.status === 'canceled') return { text: 'отменено', bad: false };
  if (isClosed(item.status)) {
    if (span.delta === null) return { text: formatDay(span.end, today), bad: false };
    if (span.delta === 0) return { text: 'в срок', bad: false };
    const days = Math.abs(span.delta);
    const sign = span.delta > 0 ? '+' : '−';
    return { text: `${sign}${days} ${plural(days, 'день', 'дня', 'дней')}`, bad: span.delta > 0 };
  }
  if (!span.due) return { text: 'без срока', bad: false };
  if (span.late > 0) return { text: dueHint(span.due, today), bad: true };
  return { text: formatDay(span.due, today), bad: false };
}

/** A folded project shows what is inside it: milestones, or tasks when it has none. */
export function laneItems(item: TreeItem, today: Day): TreeItem[] {
  if (item.entity !== 'project') return [];
  const dated = item.children.filter((child) => spanOf(child, today) !== null);
  const milestones = dated.filter((child) => child.entity === 'milestone');
  return milestones.length > 0 ? milestones : dated;
}

// --- scale -------------------------------------------------------------------

export const ZOOMS = ['days', 'weeks', 'months'] as const;
export type Zoom = (typeof ZOOMS)[number];
export const isZoom = (value: unknown): value is Zoom => ZOOMS.includes(value as Zoom);

const PX: Record<Zoom, number> = { days: 44, weeks: 20, months: 6 };
/** Empty room after the dates, to plan ahead; half as much before them. */
const ROOM: Record<Zoom, number> = { days: 42, weeks: 84, months: 270 };
/** A date with a mistyped year must not make the screen a kilometre long. */
const HORIZON = 730;

export interface Scale {
  /** Always a Monday. */
  from: Day;
  days: number;
  /** Pixels in a day. */
  px: number;
  width: number;
  x: (day: Day) => number;
  day: (x: number) => Day;
}

const monday = (day: Day): Day => addDays(day, -((toDate(day).getDay() + 6) % 7));

export function makeScale(dates: Day[], today: Day, zoom: Zoom, viewWidth: number): Scale {
  const floor = addDays(today, -HORIZON);
  const ceiling = addDays(today, HORIZON);
  let first = addDays(today, -14);
  let last = addDays(today, 28);
  for (const day of dates) {
    first = earliest(first, latest(day, floor));
    last = latest(last, earliest(day, ceiling));
  }
  const px = PX[zoom];
  const from = monday(addDays(first, -ROOM[zoom] / 2));
  const needed = Math.max(dayDiff(last, from) + ROOM[zoom], Math.ceil(viewWidth / px));
  const days = Math.ceil(needed / 7) * 7;
  return {
    from,
    days,
    px,
    width: days * px,
    x: (day) => dayDiff(day, from) * px,
    day: (x) => addDays(from, Math.floor(x / px)),
  };
}

export interface Tick {
  day: Day;
  x: number;
  label: string;
  off?: boolean;
}

const MONTH_NAMES =
  'Январь Февраль Март Апрель Май Июнь Июль Август Сентябрь Октябрь Ноябрь Декабрь'.split(' ');

/** Two lines of the header: the bigger unit above, the smaller one below. */
export function ticks(scale: Scale, zoom: Zoom): { major: Tick[]; minor: Tick[] } {
  const major: Tick[] = [];
  const minor: Tick[] = [];
  let unit = '';
  for (let i = 0; i < scale.days; i += 1) {
    const day = addDays(scale.from, i);
    const x = i * scale.px;
    const date = toDate(day);
    const month = date.getMonth();
    const year = String(date.getFullYear());
    const tick = { day, x };
    if (zoom === 'months') {
      if (year !== unit) major.push({ ...tick, label: year });
      unit = year;
      if (date.getDate() === 1) minor.push({ ...tick, label: MONTHS[month] ?? '' });
      continue;
    }
    const name = `${MONTH_NAMES[month]} ${year}`;
    if (name !== unit) major.push({ ...tick, label: name });
    unit = name;
    if (zoom === 'days') {
      const off = date.getDay() === 0 || date.getDay() === 6;
      minor.push({ ...tick, label: String(date.getDate()), off });
    } else if (date.getDay() === 1) {
      minor.push({ ...tick, label: `${date.getDate()} ${MONTHS[month]}` });
    }
  }
  // A cut first month must not run into the name of the next one.
  const [first, second] = major;
  if (first && second && second.x - first.x < 110) major.shift();
  if (major[0]) major[0].x = Math.min(major[0].x, 0);
  return { major, minor };
}

// --- boxes -------------------------------------------------------------------

export interface Box {
  left: number;
  width: number;
}

const MIN_BAR = 8;

export const barBox = (span: Span, scale: Scale): Box => ({
  left: scale.x(span.start),
  width: Math.max(MIN_BAR, (dayDiff(span.end, span.start) + 1) * scale.px),
});

/** Where the box of a point is centered: the middle of its day. */
export const pointX = (span: Span, scale: Scale): number => scale.x(span.end) + scale.px / 2;

/** Good enough to choose a place for a label; CSS cuts what is longer. */
export const labelWidth = (title: string): number => title.length * 7.1 + 36;
export const fits = (title: string, width: number): boolean => labelWidth(title) <= width;

/** Lane for every [left, right] extent: the first lane where it does not touch anything. */
export function pack(extents: [number, number][], gap = 0): number[] {
  const ends: number[] = [];
  return extents.map(([left, right]) => {
    let lane = ends.findIndex((end) => end + gap <= left);
    if (lane < 0) lane = ends.length;
    ends[lane] = right;
    return lane;
  });
}

// --- dragging ----------------------------------------------------------------

export type Grip = 'move' | 'start' | 'end' | 'draw';
export interface DateChanges {
  start_date?: Day;
  due_date?: Day;
}

/** Facts are not dragged: only the dates of open rows are a plan. */
export function grips(item: TreeItem, span: Span | null): Grip[] {
  if (isClosed(item.status)) return [];
  if (!span) return ['draw'];
  if (span.kind === 'point') return ['move', 'start'];
  return item.startDate || item.dueDate ? ['move', 'start', 'end'] : ['start', 'end'];
}

function real(item: TreeItem, changes: DateChanges): DateChanges | null {
  const same =
    (changes.start_date ?? item.startDate) === item.startDate &&
    (changes.due_date ?? item.dueDate) === item.dueDate;
  return same ? null : changes;
}

export function dragDates(
  item: TreeItem,
  span: Span,
  grip: Exclude<Grip, 'draw'>,
  days: number,
): DateChanges | null {
  if (days === 0) return null;
  const { startDate, dueDate } = item;
  if (grip === 'start') {
    const moved = addDays(span.start, days);
    return real(item, { start_date: dueDate ? earliest(moved, dueDate) : moved });
  }
  if (grip === 'end') {
    return real(item, { due_date: latest(addDays(dueDate ?? span.end, days), span.start) });
  }
  const changes: DateChanges = {};
  if (startDate) changes.start_date = addDays(startDate, days);
  if (dueDate) {
    const moved = addDays(dueDate, days);
    // The real beginning stays where it was.
    changes.due_date = startDate || span.kind === 'point' ? moved : latest(moved, span.start);
  }
  return real(item, changes);
}

export const schedule = (a: Day, b: Day): DateChanges => ({
  start_date: earliest(a, b),
  due_date: latest(a, b),
});

/** The same moves by keyboard, a day at a time. */
export function shiftDates(
  item: TreeItem,
  today: Day,
  grip: 'move' | 'end',
  days: number,
): DateChanges | null {
  if (isClosed(item.status)) return null;
  const span = spanOf(item, today);
  if (!span) return grip === 'end' ? { due_date: today } : null;
  return dragDates(item, span, span.kind === 'point' ? 'move' : grip, days);
}

export const withDates = (item: TreeItem, changes: DateChanges | null): TreeItem =>
  changes
    ? {
        ...item,
        startDate: changes.start_date ?? item.startDate,
        dueDate: changes.due_date ?? item.dueDate,
      }
    : item;
