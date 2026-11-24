/**
 * Fields of a row: which are shown and how wide they are. A new field is one line in COLUMNS
 * and one case in features/tree/cells.tsx. Numbers are pixels.
 */

export type ColumnId =
  | 'status'
  | 'priority'
  | 'progress'
  | 'start'
  | 'due'
  | 'began'
  | 'ended'
  | 'updated'
  | 'note';
export type SizedId = ColumnId | 'name';
export type Screen = 'tree' | 'timeline';

export interface Column {
  id: ColumnId;
  label: string;
  width: number;
  /** Takes the free room. */
  flex?: boolean;
  /** Shown until a person decides otherwise. */
  tree: boolean;
  timeline: boolean;
  /** The tree narrower than this hides the field. */
  room: number;
}

const WIDE = 1110;
const MEDIUM = 930;
const NARROW = 630;
/** The timeline narrower than this shows only names. */
const TIMELINE_NARROW = 780;

const COLUMNS: Column[] = [
  { id: 'status', label: 'Статус', width: 128, tree: true, timeline: false, room: 0 },
  { id: 'priority', label: 'Приоритет', width: 124, tree: false, timeline: false, room: MEDIUM },
  { id: 'progress', label: 'Прогресс', width: 100, tree: true, timeline: false, room: NARROW },
  { id: 'start', label: 'Старт', width: 90, tree: true, timeline: false, room: WIDE },
  { id: 'due', label: 'Срок', width: 96, tree: true, timeline: true, room: 0 },
  { id: 'began', label: 'Начато', width: 96, tree: false, timeline: false, room: MEDIUM },
  { id: 'ended', label: 'Закрыто', width: 96, tree: false, timeline: false, room: MEDIUM },
  { id: 'updated', label: 'Изменено', width: 124, tree: false, timeline: false, room: MEDIUM },
  {
    id: 'note',
    label: 'Комментарий',
    width: 140,
    flex: true,
    tree: true,
    timeline: false,
    room: MEDIUM,
  },
];

export const columnsOf = (): readonly Column[] => COLUMNS;

// --- what a person has chosen --------------------------------------------------

export interface ColumnSettings {
  width: Partial<Record<SizedId, number>>;
  shown: Partial<Record<ColumnId, boolean>>;
}

export const DEFAULT_COLUMNS: ColumnSettings = { width: {}, shown: {} };

const MIN: Record<'name' | 'other', number> = { name: 100, other: 40 };
const MAX = 1600;
const isSized = (id: string): id is SizedId =>
  id === 'name' || COLUMNS.some((column) => column.id === id);

const entries = (raw: unknown): [string, unknown][] =>
  raw !== null && typeof raw === 'object' ? Object.entries(raw) : [];

/** Kept in the browser, perhaps by another version: only what makes sense is taken. */
export function parseColumns(raw: unknown): ColumnSettings {
  const { width, shown } = (raw ?? {}) as Record<string, unknown>;
  const result: ColumnSettings = { width: {}, shown: {} };
  for (const [id, value] of entries(width)) {
    if (isSized(id) && typeof value === 'number' && Number.isFinite(value)) {
      result.width[id] = value;
    }
  }
  for (const [id, value] of entries(shown)) {
    if (isSized(id) && id !== 'name' && typeof value === 'boolean') result.shown[id] = value;
  }
  return result;
}

export const isShown = (settings: ColumnSettings, id: ColumnId, screen: Screen): boolean =>
  settings.shown[id] ?? COLUMNS.find((column) => column.id === id)?.[screen] ?? false;

export const showColumn = (
  settings: ColumnSettings,
  id: ColumnId,
  shown: boolean,
): ColumnSettings => ({ ...settings, shown: { ...settings.shown, [id]: shown } });

export function setWidth(settings: ColumnSettings, id: SizedId, width: number): ColumnSettings {
  const min = id === 'name' ? MIN.name : MIN.other;
  const value = Math.round(Math.min(MAX, Math.max(min, width)));
  return { ...settings, width: { ...settings.width, [id]: value } };
}

export function resetColumn(settings: ColumnSettings, id: SizedId): ColumnSettings {
  const { [id]: _, ...width } = settings.width;
  return { ...settings, width };
}

// --- layout --------------------------------------------------------------------

export interface TreeLayout {
  columns: Column[];
  /** grid-template-columns of every row: the name, the fields, the actions. */
  template: string;
  /** Below this the tree scrolls sideways. */
  minWidth: number;
  /** A phone: the status is only a mark. */
  compact: boolean;
}

const ACTIONS = 34;
const PADDING = 24;

export function treeLayout(settings: ColumnSettings, container: number): TreeLayout {
  const compact = container < NARROW;
  const columns = COLUMNS.filter(
    ({ id, room }) => isShown(settings, id, 'tree') && container >= room,
  );
  const tracks: [string, number][] = [];
  if (compact) {
    tracks.push(['minmax(0, 1fr)', 0]);
    for (const { id } of columns) tracks.push(id === 'status' ? ['30px', 30] : ['75px', 75]);
    tracks.push(['30px', 30]);
  } else {
    tracks.push(nameTrack(settings.width.name, container));
    for (const { id, width, flex } of columns) {
      const chosen = settings.width[id];
      if (chosen !== undefined) tracks.push([`${chosen}px`, chosen]);
      else tracks.push([flex ? `minmax(${width}px, 1fr)` : `${width}px`, width]);
    }
    const filled = tracks.some(([track]) => track.includes('fr)'));
    tracks.push([filled ? `${ACTIONS}px` : `minmax(${ACTIONS}px, 1fr)`, ACTIONS]);
  }
  return {
    columns,
    template: tracks.map(([track]) => track).join(' '),
    minWidth: tracks.reduce((sum, [, width]) => sum + width, PADDING),
    compact,
  };
}

function nameTrack(chosen: number | undefined, container: number): [string, number] {
  if (chosen !== undefined) {
    const width = Math.min(chosen, Math.round(container * 0.8));
    return [`${width}px`, width];
  }
  if (container >= WIDE) return ['minmax(330px, 1.7fr)', 330];
  if (container >= MEDIUM) return ['minmax(300px, 1.8fr)', 300];
  return ['minmax(0, 1fr)', 0];
}

export interface TimelineLayout {
  columns: Column[];
  template: string;
  /** Width of the name itself. */
  name: number;
  /** Width of everything to the left of the chart. */
  width: number;
}

const EDGE = 9;

export function timelineLayout(settings: ColumnSettings, container: number): TimelineLayout {
  const narrow = container < TIMELINE_NARROW;
  const usual = narrow ? 163 : container >= WIDE ? 280 : 205;
  const columns = narrow ? [] : COLUMNS.filter(({ id }) => isShown(settings, id, 'timeline'));
  const widthOf = ({ id, width }: Column) => settings.width[id] ?? width;
  const total = () => columns.reduce((sum, column) => sum + widthOf(column), EDGE);
  // The chart is what the screen is for: fields give way before it does.
  const limit = Math.floor(container * (narrow ? 0.6 : 0.75));
  while (columns.length > 0 && total() + MIN.name > limit) columns.pop();
  const name = Math.max(MIN.name, Math.min(settings.width.name ?? usual, limit - total()));
  return {
    columns,
    template: ['minmax(0, 1fr)', ...columns.map((column) => `${widthOf(column)}px`)].join(' '),
    name,
    width: name + total(),
  };
}
