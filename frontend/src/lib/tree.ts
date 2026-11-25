/** The tree as the screen needs it: three kinds of API nodes become one kind of row. */
import type {
  Entity,
  Focus,
  MilestoneNode,
  ProjectNode,
  ProjectOut,
  Signals,
  Status,
  TaskNode,
  Tree,
} from '@/api/types';
import { isClosed } from './status';

export type NodeKey = `${Entity}-${number}`;

export interface TreeItem {
  key: NodeKey;
  entity: Entity;
  id: number;
  /** Slug of the project the row belongs to (its own for a project). */
  slug: string;
  milestoneId: number | null;
  parentId: number | null;
  title: string;
  /** Summary of a project or milestone, comment of a task. */
  note: string | null;
  status: Status;
  /** Milestones have no priority. */
  priority: number | null;
  startDate: string | null;
  dueDate: string | null;
  /** When work really began and ended, by the journal. */
  actualStart: string | null;
  actualEnd: string | null;
  /** Tasks have no progress. */
  progress: number | null;
  overdue: boolean;
  upcoming: boolean;
  focus: Focus | null;
  signals: Signals;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  /** Fields only a project has. */
  project: ProjectOut | null;
  /** A project without a folder: it is only talked about. */
  future: boolean;
  children: TreeItem[];
}

export const nodeKey = (entity: Entity, id: number): NodeKey => `${entity}-${id}`;

// --- from the API ------------------------------------------------------------

function fromTask(node: TaskNode, slug: string): TreeItem {
  const { task } = node;
  return {
    key: nodeKey('task', task.id),
    entity: 'task',
    id: task.id,
    slug,
    milestoneId: task.milestone_id,
    parentId: task.parent_id,
    title: task.title,
    note: task.comment,
    status: task.status,
    priority: task.priority,
    startDate: task.start_date,
    dueDate: task.due_date,
    actualStart: node.actual.start,
    actualEnd: node.actual.end,
    progress: null,
    overdue: node.overdue,
    upcoming: node.upcoming,
    focus: null,
    signals: node.signals,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    doneAt: task.done_at,
    project: null,
    future: false,
    children: node.children.map((child) => fromTask(child, slug)),
  };
}

function fromMilestone(node: MilestoneNode, slug: string): TreeItem {
  const { milestone } = node;
  return {
    key: nodeKey('milestone', milestone.id),
    entity: 'milestone',
    id: milestone.id,
    slug,
    milestoneId: milestone.id,
    parentId: null,
    title: milestone.name,
    note: milestone.summary,
    status: milestone.status,
    priority: null,
    startDate: milestone.start_date,
    dueDate: milestone.due_date,
    actualStart: node.actual.start,
    actualEnd: node.actual.end,
    progress: node.progress,
    overdue: node.overdue,
    upcoming: node.upcoming,
    focus: null,
    signals: node.signals,
    createdAt: milestone.created_at,
    updatedAt: milestone.updated_at,
    doneAt: milestone.done_at,
    project: null,
    future: false,
    children: node.tasks.map((task) => fromTask(task, slug)),
  };
}

function fromProject(node: ProjectNode): TreeItem {
  const { project } = node;
  return {
    key: nodeKey('project', project.id),
    entity: 'project',
    id: project.id,
    slug: project.slug,
    milestoneId: null,
    parentId: null,
    title: project.name,
    note: project.summary,
    status: project.status,
    priority: project.priority,
    startDate: project.start_date,
    dueDate: project.due_date,
    actualStart: node.actual.start,
    actualEnd: node.actual.end,
    progress: node.progress,
    overdue: node.overdue,
    upcoming: node.upcoming,
    focus: node.focus,
    signals: node.signals,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    doneAt: project.done_at,
    project,
    future: node.future,
    children: [
      ...node.milestones.map((m) => fromMilestone(m, project.slug)),
      ...node.tasks.map((t) => fromTask(t, project.slug)),
    ],
  };
}

/** Future projects come last. */
export function buildItems(tree: Tree): TreeItem[] {
  const items = tree.projects.map(fromProject);
  return [...items.filter((item) => !item.future), ...items.filter((item) => item.future)];
}

// --- looking around ----------------------------------------------------------

export function* walk(items: TreeItem[]): Generator<TreeItem> {
  for (const item of items) {
    yield item;
    yield* walk(item.children);
  }
}

export function findItem(items: TreeItem[], key: string): TreeItem | undefined {
  for (const item of walk(items)) if (item.key === key) return item;
  return undefined;
}

export function ancestorsOf(items: TreeItem[], key: string): NodeKey[] {
  for (const item of items) {
    if (item.key === key) return [];
    if (findItem(item.children, key)) return [item.key, ...ancestorsOf(item.children, key)];
  }
  return [];
}

// --- filters -----------------------------------------------------------------

export const VIEWS = ['in_progress', 'blocked', 'overdue', 'upcoming'] as const;
export type View = (typeof VIEWS)[number];

export interface Filter {
  q: string;
  view: View | null;
  statuses: Status[];
  /** Slug of the only project to show. */
  project: string | null;
  hideClosed: boolean;
}

export const EMPTY_FILTER: Filter = {
  q: '',
  view: null,
  statuses: [],
  project: null,
  hideClosed: false,
};

/** A filter that looks for rows inside branches, so branches open by themselves. */
export const isFiltering = (f: Filter): boolean =>
  f.q.trim() !== '' || f.view !== null || f.statuses.length > 0;

const IN_VIEW: Record<View, (item: TreeItem) => boolean> = {
  in_progress: (item) => item.status === 'in_progress',
  blocked: (item) => item.status === 'blocked',
  overdue: (item) => item.overdue,
  upcoming: (item) => item.upcoming,
};

export const normalize = (text: string) => text.toLowerCase().replaceAll('\u0451', 'е');

function matcher(filter: Filter): (item: TreeItem) => boolean {
  const words = normalize(filter.q).split(/\s+/).filter(Boolean);
  return (item) => {
    if (filter.view !== null && !IN_VIEW[filter.view](item)) return false;
    if (filter.statuses.length > 0 && !filter.statuses.includes(item.status)) return false;
    if (words.length === 0) return true;
    const own = item.entity === 'project' ? item.slug : '';
    const text = normalize(`${item.title} ${item.note ?? ''} ${own}`);
    return words.every((word) =>
      /^#\d+$/.test(word) ? word === `#${item.id}` : text.includes(word),
    );
  };
}

export function countViews(items: TreeItem[]): Record<View, number> {
  const counts: Record<View, number> = { in_progress: 0, blocked: 0, overdue: 0, upcoming: 0 };
  for (const item of walk(items)) {
    for (const view of VIEWS) if (IN_VIEW[view](item)) counts[view] += 1;
  }
  return counts;
}

// --- rows on the screen ------------------------------------------------------

export interface Row {
  item: TreeItem;
  depth: number;
  hasChildren: boolean;
  open: boolean;
  /** False for a row shown only as the path to a match. */
  match: boolean;
  position: number;
  siblings: number;
  /** The first future project of the screen carries their number: a heading goes above it. */
  futureGroup: number | null;
}

/** For assistive technology: the header and the heading of future projects are rows too. */
export const rowCount = (rows: Row[]): number =>
  rows.length + 1 + Number(rows.some((row) => row.futureGroup !== null));

export interface Unfolded {
  /** Opened by hand, remembered between visits. */
  expanded: ReadonlySet<NodeKey>;
  /** Opened or folded by hand while a filter is on, forgotten when it changes. */
  toggled: ReadonlySet<NodeKey>;
}

export function visibleRows(items: TreeItem[], filter: Filter, unfolded: Unfolded): Row[] {
  const filtering = isFiltering(filter);
  const matches = matcher(filter);
  const rows: Row[] = [];

  const closedBranch = (item: TreeItem): boolean =>
    isClosed(item.status) && item.children.every(closedBranch);
  const matchBelow = (item: TreeItem): boolean =>
    item.children.some((child) => allowed(child) && (matches(child) || matchBelow(child)));
  const allowed = (item: TreeItem) => !(filter.hideClosed && closedBranch(item));

  function add(list: TreeItem[], depth: number, wholeBranch: boolean) {
    const shown = list.filter(
      (item) => allowed(item) && (!filtering || wholeBranch || matches(item) || matchBelow(item)),
    );
    const firstFuture = shown.findIndex((item) => item.future);
    shown.forEach((item, index) => {
      const own = matches(item);
      const below = filtering && matchBelow(item);
      const toggled = unfolded.toggled.has(item.key);
      const open = filtering ? below !== toggled : unfolded.expanded.has(item.key);
      // Opened by hand under a filter: the user wants to see everything inside.
      const whole = filtering && !below && (own || wholeBranch);
      const children = item.children.filter(allowed);
      const hasChildren = children.length > 0 && (!filtering || below || whole);
      rows.push({
        item,
        depth,
        hasChildren,
        open: open && hasChildren,
        match: !filtering || own,
        position: index + 1,
        siblings: shown.length,
        futureGroup: index === firstFuture ? shown.length - firstFuture : null,
      });
      if (open && hasChildren) add(children, depth + 1, whole);
    });
  }

  const roots = filter.project ? items.filter((item) => item.slug === filter.project) : items;
  add(roots, 0, false);
  return rows;
}
