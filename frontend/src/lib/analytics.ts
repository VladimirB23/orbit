/** Words and scales of the analytics screen. Numbers come from the server, nothing is counted twice. */
import type { ActivityRow, Analytics, Cycle, Deadline, FocusRow, Measure, Plan } from '@/api/types';
import { addDays, type Day, dayDiff, formatDate, MONTHS, plural, toDate } from './dates';

// --- period ------------------------------------------------------------------

export const PERIODS = ['7d', '30d', '90d', 'all'] as const;
export type PeriodKey = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: PeriodKey = '30d';

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  '7d': '7 дней',
  '30d': '30 дней',
  '90d': '90 дней',
  all: 'Все время',
};

export interface PeriodSearch {
  period?: PeriodKey;
  from?: Day;
  to?: Day;
}

export interface Period {
  key: PeriodKey | 'own';
  /** Null: since the first known fact, the server knows when it was. */
  start: Day | null;
  end: Day;
}

export function resolvePeriod({ period, from, to }: PeriodSearch, today: Day): Period {
  if (from && to && from <= to) return { key: 'own', start: from, end: to };
  const key = period ?? DEFAULT_PERIOD;
  if (key === 'all') return { key, start: null, end: today };
  return { key, start: addDays(today, 1 - Number.parseInt(key, 10)), end: today };
}

export function periodText(start: Day, end: Day): string {
  if (start === end) return formatDate(end);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const first = formatDate(start);
  return `${sameYear ? first.slice(0, -5) : first} – ${formatDate(end)}`;
}

// --- words -------------------------------------------------------------------

const daysWord = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
const percent = (share: number) => `${Math.round(share * 100)}%`;

/** "1,5 дня": a fraction always takes the genitive singular. */
const daysOf = (n: number) =>
  Number.isInteger(n) ? daysWord(n) : `${String(n).replace('.', ',')} дня`;

export function deltaText({ value, before }: Measure, days: number): string {
  const then = `за ${daysWord(days)} до этого`;
  if (before === null) return 'сравнить не с чем: раньше записей нет';
  if (before === 0) return value === 0 ? `и ${then} тоже` : `${then} записей не было`;
  if (value === before) return `столько же, сколько ${then}`;
  const more = value > before;
  return `на ${Math.abs(value - before)} ${more ? 'больше' : 'меньше'}, чем ${then}`;
}

export interface LeadPart {
  text: string;
  tone?: 'strong' | 'low';
}

const facts = ({ sessions, commits }: FocusRow) =>
  `${sessions} ${plural(sessions, 'сессия', 'сессии', 'сессий')} и ` +
  `${commits} ${plural(commits, 'коммит', 'коммита', 'коммитов')}`;

function leadOfOne(row: FocusRow): LeadPart[] {
  const name: LeadPart = { text: row.name, tone: 'strong' };
  if (row.sessions + row.commits === 0) {
    return [name, { text: ': за этот период ни сессий, ни коммитов.' }];
  }
  const parts: LeadPart[] = [name, { text: `: ${facts(row)}, ${percent(row.share)} внимания.` }];
  const wanted = percent(row.expected ?? 0);
  if (row.attention === 'low') parts.push({ text: ` Это мало: ждали ${wanted}.`, tone: 'low' });
  if (row.attention === 'high') parts.push({ text: ` Это больше, чем ждали (${wanted}).` });
  return parts;
}

/** The answer before the charts: where attention goes and where it is missing. */
export function lead({ focus }: Pick<Analytics, 'focus'>, filtered = false): LeadPart[] {
  if (filtered && focus[0]) return leadOfOne(focus[0]);
  const main = focus.find((row) => row.sessions + row.commits > 0);
  if (!main) return [{ text: 'За этот период нет ни сессий, ни коммитов.' }];
  const parts: LeadPart[] = [
    { text: 'Основной фокус: ' },
    { text: main.name, tone: 'strong' },
    { text: `, ${percent(main.share)} внимания. ` },
  ];
  const low = focus
    .filter((row) => row.attention === 'low')
    .sort((a, b) => a.share / (a.expected || 1) - b.share / (b.expected || 1));
  if (low.length > 0) {
    parts.push({ text: 'Мало внимания: ' });
    low.forEach((row, i) => {
      parts.push({ text: row.name, tone: 'low' });
      parts.push({ text: `, ${percent(row.share)} при ожидаемых ${percent(row.expected ?? 0)}` });
      parts.push({ text: i === low.length - 1 ? '.' : '; ' });
    });
  } else if (focus.some((row) => row.attention !== 'unknown')) {
    parts.push({ text: 'Внимание распределено примерно по приоритетам.' });
  } else {
    parts.push({ text: 'Судить о распределении рано: мало сессий и коммитов.' });
  }
  return parts;
}

export function deadlineTitle(items: Pick<Deadline, 'days'>[]): string {
  const late = items.filter((item) => item.days < 0).length;
  if (late > 0) {
    return `${late} ${plural(late, 'срок прошел', 'срока прошли', 'сроков прошли')}`;
  }
  const next = items[0];
  if (!next) return 'На две недели сроков нет';
  return `Просрочек нет, ближайший срок ${inDays(next.days)}`;
}

/** "сегодня", "завтра", "через 5 дней", "3 дня назад". */
export function inDays(days: number): string {
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days === -1) return 'вчера';
  return days > 0 ? `через ${daysWord(days)}` : `${daysWord(-days)} назад`;
}

export function closedTitle({ totals }: Pick<Analytics, 'totals'>): string {
  const n = totals.closed.value;
  const born = totals.born_closed;
  const written = `${born} ${plural(born, 'записана уже закрытой', 'записаны уже закрытыми', 'записаны уже закрытыми')}`;
  if (n === 0) return born ? `Закрытых в работе нет, ${written}` : 'За период ничего не закрыто';
  const done = `${plural(n, 'Закрыта', 'Закрыто', 'Закрыто')} ${n} ${plural(n, 'задача', 'задачи', 'задач')}`;
  return born ? `${done}, еще ${written}` : done;
}

export function cycleTitle({ known, needed, median, p85 }: Cycle): string {
  if (known === 0) return 'Cycle time: считать не на чем';
  if (known < needed || median === null || p85 === null) return 'Cycle time: данных пока мало';
  if (p85 === 0) return 'Почти все закрыто в день начала';
  return `Половина задач готова за ${daysOf(median)}, 85% за ${daysOf(p85)}`;
}

/** Against the plan: "+2 дня" is late. */
export function lateText(days: number): string {
  if (days === 0) return 'в срок';
  return `${days > 0 ? '+' : '−'}${daysWord(Math.abs(days))}`;
}

export function planTitle({ compared, needed, late }: Plan): string {
  if (compared === 0) return 'План и факт: сравнивать нечего';
  if (compared < needed) return 'План и факт: данных пока мало';
  if (late === 0) {
    return `Все ${compared} ${plural(compared, 'этап закрыт', 'этапа закрыты', 'этапов закрыты')} в срок`;
  }
  return `${compared - late} из ${compared} этапов закрыты в срок`;
}

// --- focus -------------------------------------------------------------------

export const QUIET_DAYS = 7;

/** An idea nobody touches is not a problem: it only takes space in the table. */
export function splitFocus(rows: FocusRow[]): { shown: FocusRow[]; silent: FocusRow[] } {
  const alive = (row: FocusRow) =>
    rows.length === 1 ||
    row.status === 'in_progress' ||
    row.sessions + row.commits + row.closed > 0;
  return { shown: rows.filter(alive), silent: rows.filter((row) => !alive(row)) };
}

export function quietText(row: FocusRow, today: Day): { text: string; late: boolean } {
  if (row.last_day === null) return { text: 'не начат', late: false };
  const days = dayDiff(today, row.last_day);
  return { text: inDays(-days), late: row.status === 'in_progress' && days >= QUIET_DAYS };
}

// --- time --------------------------------------------------------------------

export type Step = Analytics['step'];

const month = (date: Date) => MONTHS[date.getMonth()] ?? '';

export function stepLabel(step: Day, unit: Step): string {
  const date = toDate(step);
  if (unit === 'month') return month(date);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function stepTitle(step: Day, unit: Step, today: Day): string {
  const from = toDate(step);
  if (unit === 'day') return `${from.getDate()} ${month(from)}`;
  if (unit === 'month') return `${month(from)} ${from.getFullYear()}`;
  const last = addDays(step, 6);
  const to = toDate(last);
  const days =
    from.getMonth() === to.getMonth()
      ? `${from.getDate()}–${to.getDate()} ${month(to)}`
      : `${from.getDate()} ${month(from)} – ${to.getDate()} ${month(to)}`;
  return step <= today && today <= last ? `${days}, идет сейчас` : days;
}

/** The step that holds today has not ended yet. */
export function isRunning(step: Day, unit: Step, today: Day): boolean {
  if (unit === 'day') return step === today;
  if (unit === 'week') return step <= today && today <= addDays(step, 6);
  return step.slice(0, 7) === today.slice(0, 7);
}

/** Whether a label fits: at most `most` of them, counted from the last step. */
export function labelEvery(index: number, count: number, most: number): boolean {
  return (count - 1 - index) % Math.ceil(count / most) === 0;
}

export interface FoldedRow extends Omit<ActivityRow, 'slug'> {
  /** Null: several projects in one row. */
  slug: string | null;
}

export function topRows(rows: ActivityRow[], most: number): FoldedRow[] {
  if (rows.length <= most) return rows;
  const rest = rows.slice(most - 1);
  const sum = (pick: (row: ActivityRow) => number[]) =>
    rest.map(pick).reduce((total, line) => total.map((value, i) => value + (line[i] ?? 0)));
  return [
    ...rows.slice(0, most - 1),
    {
      slug: null,
      name: `Остальные (${rest.length})`,
      sessions: sum((row) => row.sessions),
      commits: sum((row) => row.commits),
    },
  ];
}

// --- scales ------------------------------------------------------------------

const TOPS = [4, 8, 12, 16, 20, 24, 32, 40, 48, 60, 80];

/** A round number not below the value that divides by four: gridlines fall on whole numbers. */
export function niceTop(value: number): number {
  for (let size = 1; ; size *= 10) {
    const top = TOPS.find((base) => base * size >= value);
    if (top !== undefined) return top * size;
  }
}

/** 0 is nothing; 1–4 are quarters of the biggest value. */
export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as 1 | 2 | 3 | 4;
}

export interface Bin {
  label: string;
  count: number;
}

const BINS: [label: string, upTo: number][] = [
  ['0', 0],
  ['1', 1],
  ['2', 2],
  ['3–4', 4],
  ['5–7', 7],
  ['8–14', 14],
  ['15+', Number.POSITIVE_INFINITY],
];

export function cycleBins(days: number[]): Bin[] {
  return BINS.map(([label, upTo], i) => {
    const from = BINS[i - 1]?.[1] ?? -1;
    return { label, count: days.filter((n) => n > from && n <= upTo).length };
  });
}
