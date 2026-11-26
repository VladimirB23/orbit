/** Rows in another order by a field: each level among itself, the structure stays. */
import type { Status } from '@/api/types';
import type { TreeItem } from './tree';

export const SORT_KEYS = [
  'name',
  'status',
  'priority',
  'progress',
  'start',
  'due',
  'began',
  'ended',
  'updated',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface Sort {
  key: SortKey;
  /** From the largest value: the latest date, the highest priority. */
  desc: boolean;
}

type Value = string | number | null;

/** Attention first: what is moving, what is stuck, what is next; closed at the end. */
const STATUS_RANK: Record<Status, number> = {
  in_progress: 0,
  blocked: 1,
  planned: 2,
  paused: 3,
  backlog: 4,
  done: 5,
  canceled: 6,
};

interface Field {
  label: string;
  value: (item: TreeItem) => Value;
  /** The order of the first click: the one most often wanted. */
  desc: boolean;
  /** Words for both ways: [from the smallest, from the largest]. */
  ways: [string, string];
}

const DATES: [string, string] = ['сначала ранние', 'сначала поздние'];

export const SORT_FIELDS: Record<SortKey, Field> = {
  name: { label: 'Название', value: (i) => i.title, desc: false, ways: ['А-Я', 'Я-А'] },
  status: {
    label: 'Статус',
    value: (i) => STATUS_RANK[i.status],
    desc: false,
    ways: ['сначала в работе', 'сначала закрытые'],
  },
  priority: {
    label: 'Приоритет',
    // Without a priority is like without a date: always at the end.
    value: (i) => (i.priority ? i.priority : null),
    desc: true,
    ways: ['сначала низкий', 'сначала срочные'],
  },
  progress: {
    label: 'Прогресс',
    value: (i) => i.progress,
    desc: false,
    ways: ['сначала отстающие', 'сначала почти готовые'],
  },
  start: { label: 'Старт', value: (i) => i.startDate, desc: false, ways: DATES },
  due: {
    label: 'Срок',
    value: (i) => i.dueDate,
    desc: false,
    ways: ['сначала ближайшие', 'сначала дальние'],
  },
  began: { label: 'Начато', value: (i) => i.actualStart, desc: false, ways: DATES },
  ended: { label: 'Закрыто', value: (i) => i.actualEnd, desc: true, ways: DATES },
  updated: {
    label: 'Изменено',
    value: (i) => i.updatedAt,
    desc: true,
    ways: ['сначала давние', 'сначала свежие'],
  },
};

export const isSortKey = (value: unknown): value is SortKey =>
  typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);

export const isNatural = (sort: Sort): boolean => sort.desc === SORT_FIELDS[sort.key].desc;

/** How the order reads: "Срок, сначала ближайшие". */
export const describeSort = (sort: Sort): string => {
  const field = SORT_FIELDS[sort.key];
  return `${field.label}, ${field.ways[sort.desc ? 1 : 0]}`;
};

/** A click on a field: the useful order, the reverse one, back to the usual. */
export function nextSort(current: Sort | null, key: SortKey): Sort | null {
  const natural = { key, desc: SORT_FIELDS[key].desc };
  if (current?.key !== key) return natural;
  return isNatural(current) ? { key, desc: !natural.desc } : null;
}

/** Kept in the browser, perhaps by another version. */
export function parseSort(raw: unknown): Sort | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { key, desc } = raw as Record<string, unknown>;
  return isSortKey(key) && typeof desc === 'boolean' ? { key, desc } : null;
}

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

function compare(a: Value, b: Value, desc: boolean): number {
  // Rows without a value are never in the way, whichever direction.
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const order =
    typeof a === 'string' && typeof b === 'string' ? collator.compare(a, b) : Number(a) - Number(b);
  return desc ? -order : order;
}

/**
 * Siblings are ordered among their own kind: milestones stay above loose tasks and future
 * projects stay last, so the tree keeps its shape. Equal rows keep the usual order.
 */
export function sortItems(items: TreeItem[], sort: Sort | null): TreeItem[] {
  if (!sort) return items;
  const { value, desc } = { ...SORT_FIELDS[sort.key], desc: sort.desc };
  const kindOf = (item: TreeItem) =>
    item.future ? 3 : item.entity === 'milestone' ? 0 : item.entity === 'project' ? 1 : 2;
  const level = (list: TreeItem[]): TreeItem[] =>
    list
      .map((item) => ({ ...item, children: level(item.children) }))
      .sort((a, b) => kindOf(a) - kindOf(b) || compare(value(a), value(b), desc));
  return level(items);
}
