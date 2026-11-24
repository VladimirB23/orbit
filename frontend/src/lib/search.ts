/** Filters in the address bar: reload, Back and bookmarks keep them. */
import type { Status } from '@/api/types';
import { PERIODS, type PeriodKey } from './analytics';
import { type Day, toDate, toDay } from './dates';
import { isStatus } from './status';
import { VIEWS, type View } from './tree';

/** The tree when absent: the same rows on a time scale, or numbers about them. */
export type Screen = 'timeline' | 'analytics';

export interface TreeSearch {
  screen?: Screen;
  q?: string;
  view?: View;
  status?: Status[];
  project?: string;
  archived?: boolean;
  /** Row open in the side panel, e.g. "task-12". */
  item?: string;
  /** Of the analytics: a preset or own dates. */
  period?: PeriodKey;
  from?: Day;
  to?: Day;
}

/** A real calendar day: 2026-13-01 would break every date after it. */
function isDay(value: unknown): value is Day {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = toDate(value);
  return !Number.isNaN(date.getTime()) && toDay(date) === value;
}

/** Every key is named: the router keeps the raw value of a key that is simply absent. */
const NOTHING: { [key in keyof Required<TreeSearch>]: undefined } = {
  screen: undefined,
  q: undefined,
  view: undefined,
  status: undefined,
  project: undefined,
  archived: undefined,
  item: undefined,
  period: undefined,
  from: undefined,
  to: undefined,
};

export function parseTreeSearch(raw: Record<string, unknown>): TreeSearch {
  const result: TreeSearch = { ...NOTHING };
  if (raw.screen === 'timeline' || raw.screen === 'analytics') result.screen = raw.screen;
  // The router reads ?q=5 as a number.
  if (typeof raw.q === 'string' || typeof raw.q === 'number') result.q = String(raw.q);
  if (VIEWS.includes(raw.view as View)) result.view = raw.view as View;
  const status = Array.isArray(raw.status) ? raw.status.filter(isStatus) : [];
  if (status.length > 0) result.status = status;
  if (typeof raw.project === 'string') result.project = raw.project;
  if (raw.archived === true) result.archived = true;
  if (typeof raw.item === 'string' && /^(project|milestone|task)-\d+$/.test(raw.item)) {
    result.item = raw.item;
  }
  const period = PERIODS.find((key) => key === raw.period);
  if (period) result.period = period;
  if (isDay(raw.from)) result.from = raw.from;
  if (isDay(raw.to)) result.to = raw.to;
  return result;
}
