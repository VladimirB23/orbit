import { describe, expect, it } from 'vitest';
import { milestone, project, task, tree } from '@/test-data';
import {
  ancestorsOf,
  buildItems,
  countViews,
  EMPTY_FILTER,
  type Filter,
  findItem,
  isFiltering,
  type NodeKey,
  visibleRows,
} from './tree';

const none = new Set<NodeKey>();
const keys = (...list: NodeKey[]) => new Set<NodeKey>(list);
const only = (patch: Partial<Filter>): Filter => ({ ...EMPTY_FILTER, ...patch });

// Orbit(1) > Core(1, done) > Schema(1, done)
//          > UI(2, in progress) > Tree view(2, overdue) > Row(4)
//                               > Panel(3, blocked)
//          > Buy a domain(5, loose task)
// Cats(2) > nothing
const sample = tree([
  project(1, {
    slug: 'orbit',
    name: 'Orbit',
    status: 'in_progress',
    milestones: [
      milestone(1, {
        name: 'Core',
        status: 'done',
        tasks: [task(1, { title: 'Schema', status: 'done' })],
      }),
      milestone(2, {
        name: 'UI',
        status: 'in_progress',
        tasks: [
          task(2, { title: 'Tree view', overdue: true, children: [task(4, { title: 'Row' })] }),
          task(3, { title: 'Panel', status: 'blocked', comment: 'Ждем макет' }),
        ],
      }),
    ],
    tasks: [task(5, { title: 'Buy a domain' })],
  }),
  project(2, { slug: 'atlas', name: 'Атлас и компас', summary: 'Ещ\u0451 одна игра' }),
]);
const items = buildItems(sample);
const titles = (filter: Filter, expanded = none, toggled = none) =>
  visibleRows(items, filter, { expanded, toggled }).map((r) => r.item.title);

describe('buildItems', () => {
  it('puts milestones before loose tasks and keeps the nesting', () => {
    expect(items.map((i) => i.key)).toEqual(['project-1', 'project-2']);
    expect(items[0]?.children.map((i) => i.key)).toEqual(['milestone-1', 'milestone-2', 'task-5']);
    expect(findItem(items, 'task-4')?.title).toBe('Row');
  });

  it('gives every row the slug and the milestone it belongs to', () => {
    expect(findItem(items, 'task-4')).toMatchObject({ slug: 'orbit', milestoneId: 2, parentId: 2 });
    expect(findItem(items, 'task-5')).toMatchObject({ slug: 'orbit', milestoneId: null });
  });

  it('finds the path to a row so it can be revealed', () => {
    expect(ancestorsOf(items, 'task-4')).toEqual(['project-1', 'milestone-2', 'task-2']);
    expect(ancestorsOf(items, 'project-1')).toEqual([]);
  });
});

describe('without filters', () => {
  it('shows only projects until something is expanded', () => {
    expect(titles(EMPTY_FILTER)).toEqual(['Orbit', 'Атлас и компас']);
  });

  it('shows the children of expanded rows with their depth', () => {
    const rows = visibleRows(items, EMPTY_FILTER, {
      expanded: keys('project-1', 'milestone-2'),
      toggled: none,
    });
    expect(rows.map((r) => [r.item.title, r.depth])).toEqual([
      ['Orbit', 0],
      ['Core', 1],
      ['UI', 1],
      ['Tree view', 2],
      ['Panel', 2],
      ['Buy a domain', 1],
      ['Атлас и компас', 0],
    ]);
  });

  it('tells assistive technology the position among siblings', () => {
    const rows = visibleRows(items, EMPTY_FILTER, { expanded: keys('project-1'), toggled: none });
    expect(rows[2]).toMatchObject({ position: 2, siblings: 3 });
  });

  it('can hide closed items', () => {
    expect(titles(only({ hideClosed: true }), keys('project-1'))).toEqual([
      'Orbit',
      'UI',
      'Buy a domain',
      'Атлас и компас',
    ]);
  });

  it('keeps a closed item that still has open work inside', () => {
    const forced = buildItems(
      tree([project(1, { name: 'P', status: 'done', tasks: [task(1, { title: 'Open' })] })]),
    );
    const rows = visibleRows(forced, only({ hideClosed: true }), { expanded: none, toggled: none });
    expect(rows.map((r) => r.item.title)).toEqual(['P']);
  });
});

describe('with filters', () => {
  it('shows matches with the path to them, opened', () => {
    expect(titles(only({ view: 'overdue' }))).toEqual(['Orbit', 'UI', 'Tree view']);
  });

  it('marks rows shown only as context', () => {
    const rows = visibleRows(items, only({ view: 'overdue' }), { expanded: none, toggled: none });
    expect(rows.map((r) => r.match)).toEqual([false, false, true]);
  });

  it('ignores what was expanded before filtering', () => {
    expect(titles(only({ view: 'in_progress' }), keys('project-1', 'milestone-2'))).toEqual([
      'Orbit',
      'UI',
    ]);
  });

  it('lets the user open a match to see everything inside it', () => {
    expect(titles(only({ q: 'orbit' }), none, keys('project-1'))).toEqual([
      'Orbit',
      'Core',
      'UI',
      'Buy a domain',
    ]);
  });

  it('lets the user fold a branch that was opened by the filter', () => {
    expect(titles(only({ view: 'overdue' }), none, keys('milestone-2'))).toEqual(['Orbit', 'UI']);
  });

  it('searches titles, notes and slugs by all words, in any case', () => {
    expect(titles(only({ q: 'МАКЕТ ждем' }))).toEqual(['Orbit', 'UI', 'Panel']);
    expect(titles(only({ q: 'atlas' }))).toEqual(['Атлас и компас']);
  });

  it('treats the two dots over Е as optional', () => {
    expect(titles(only({ q: 'еще' }))).toEqual(['Атлас и компас']);
  });

  it('finds an item by its number', () => {
    expect(titles(only({ q: '#3' }))).toContain('Panel');
    expect(titles(only({ q: '#3' }))).not.toContain('Row');
  });

  it('combines statuses, project and search', () => {
    expect(titles(only({ statuses: ['blocked', 'done'] }))).toEqual([
      'Orbit',
      'Core',
      'Schema',
      'UI',
      'Panel',
    ]);
    expect(titles(only({ project: 'atlas' }))).toEqual(['Атлас и компас']);
    expect(titles(only({ project: 'atlas', view: 'overdue' }))).toEqual([]);
  });

  it('choosing a project narrows the list but is not a search', () => {
    expect(isFiltering(only({ project: 'atlas' }))).toBe(false);
    expect(isFiltering(only({ hideClosed: true }))).toBe(false);
    expect(isFiltering(only({ q: '  ' }))).toBe(false);
    expect(isFiltering(only({ view: 'blocked' }))).toBe(true);
  });
});

describe('countViews', () => {
  it('counts the same rows the filter will show as matches', () => {
    const counts = countViews(items);
    expect(counts).toEqual({ in_progress: 2, blocked: 1, overdue: 1, upcoming: 0 });
    for (const view of ['in_progress', 'blocked', 'overdue', 'upcoming'] as const) {
      const rows = visibleRows(items, only({ view }), { expanded: none, toggled: none });
      expect(rows.filter((r) => r.match)).toHaveLength(counts[view]);
    }
  });
});
