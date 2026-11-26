import { describe, expect, it } from 'vitest';
import { milestone, project, task, tree } from '@/test-data';
import { isNatural, nextSort, parseSort, type Sort, sortItems } from './sort';
import { buildItems, type TreeItem } from './tree';

const titles = (list: TreeItem[]) => list.map((item) => item.title);
const by = (key: Sort['key'], desc?: boolean): Sort => {
  const natural = nextSort(null, key) as Sort;
  return desc === undefined ? natural : { key, desc };
};

// Alpha (due 12-10) > Late (12-20), Soon (12-01), No date; tasks Fix (12-05), Ask (none)
// Beta (due 12-01, priority 1), Gamma (no due, priority 4), Delta (future, due 11-01)
const items = buildItems(
  tree([
    project(1, {
      name: 'Alpha',
      due_date: '2026-12-10',
      priority: 2,
      status: 'planned',
      milestones: [
        milestone(1, { name: 'Late', due_date: '2026-12-20', status: 'done' }),
        milestone(2, {
          name: 'Soon',
          due_date: '2026-12-01',
          tasks: [
            task(3, { title: 'Second', due_date: '2026-12-03' }),
            task(4, { title: 'First', due_date: '2026-12-02' }),
          ],
        }),
        milestone(5, { name: 'No date', status: 'in_progress' }),
      ],
      tasks: [
        task(1, { title: 'Ask', status: 'blocked' }),
        task(2, {
          title: 'Fix',
          due_date: '2026-12-05',
          children: [
            task(6, { title: 'Sub b', due_date: '2026-12-09' }),
            task(7, { title: 'Sub a', due_date: '2026-12-04' }),
          ],
        }),
      ],
    }),
    project(2, { name: 'Beta', due_date: '2026-12-01', priority: 1, status: 'in_progress' }),
    project(3, { name: 'Gamma', priority: 4, status: 'blocked' }),
    project(4, { name: 'Delta', due_date: '2026-11-01', priority: 4, future: true }),
  ]),
);
const alpha = (list: TreeItem[]) => list.find((item) => item.title === 'Alpha') as TreeItem;

describe('sortItems', () => {
  it('keeps the usual order without a sort and never changes what it gets', () => {
    expect(sortItems(items, null)).toBe(items);
    sortItems(items, by('due'));
    expect(titles(items)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
  });

  it('puts the nearest deadline first and rows without one last, both ways', () => {
    expect(titles(sortItems(items, by('due')))).toEqual(['Beta', 'Alpha', 'Gamma', 'Delta']);
    expect(titles(sortItems(items, by('due', true)))).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
  });

  it('sorts every level on its own: milestones stay above loose tasks', () => {
    const sorted = sortItems(items, by('due'));
    const children = alpha(sorted).children;
    expect(titles(children)).toEqual(['Soon', 'Late', 'No date', 'Fix', 'Ask']);
    expect(titles(children[0]?.children ?? [])).toEqual(['First', 'Second']);
    expect(titles(children[3]?.children ?? [])).toEqual(['Sub a', 'Sub b']);
  });

  it('leaves future projects at the end whatever their fields', () => {
    for (const key of ['due', 'priority', 'name'] as const) {
      expect(titles(sortItems(items, by(key))).at(-1)).toBe('Delta');
      expect(titles(sortItems(items, by(key, !by(key).desc))).at(-1)).toBe('Delta');
    }
  });

  it('puts the most urgent first; no priority is like no value', () => {
    expect(titles(sortItems(items, by('priority')))).toEqual(['Gamma', 'Alpha', 'Beta', 'Delta']);
    const none = buildItems(
      tree([project(1, { name: 'None', priority: 0 }), project(2, { name: 'Low', priority: 1 })]),
    );
    expect(titles(sortItems(none, by('priority')))).toEqual(['Low', 'None']);
    expect(titles(sortItems(none, by('priority', false)))).toEqual(['Low', 'None']);
  });

  it('orders statuses by attention: work, blocks, plans, then the closed ones', () => {
    expect(titles(sortItems(items, by('status')))).toEqual(['Beta', 'Gamma', 'Alpha', 'Delta']);
    expect(titles(alpha(sortItems(items, by('status'))).children)).toEqual([
      'No date',
      'Soon',
      'Late',
      'Ask',
      'Fix',
    ]);
  });

  it('compares names as people read them', () => {
    const named = buildItems(
      tree([
        project(1, { name: 'Этап 10' }),
        project(2, { name: '\u0451лка' }),
        project(3, { name: 'Этап 2' }),
        project(4, { name: 'Ель' }),
      ]),
    );
    expect(titles(sortItems(named, by('name')))).toEqual(['\u0451лка', 'Ель', 'Этап 2', 'Этап 10']);
  });

  it('keeps the usual order among equals', () => {
    const same = buildItems(
      tree([1, 2, 3].map((id) => project(id, { name: `P${id}`, due_date: '2026-12-01' }))),
    );
    expect(titles(sortItems(same, by('due')))).toEqual(['P1', 'P2', 'P3']);
    expect(titles(sortItems(same, by('due', true)))).toEqual(['P1', 'P2', 'P3']);
  });

  it('shows the latest change first', () => {
    const changed = buildItems(
      tree([
        project(1, { name: 'Old', updated_at: '2026-11-01T10:00:00Z' }),
        project(2, { name: 'New', updated_at: '2026-11-20T10:00:00Z' }),
      ]),
    );
    expect(titles(sortItems(changed, by('updated')))).toEqual(['New', 'Old']);
  });
});

describe('nextSort', () => {
  it('goes from the useful order to the reverse and back to none', () => {
    const first = nextSort(null, 'due');
    expect(first).toEqual({ key: 'due', desc: false });
    const second = nextSort(first, 'due');
    expect(second).toEqual({ key: 'due', desc: true });
    expect(nextSort(second, 'due')).toBeNull();
  });

  it('starts the useful way for each field', () => {
    expect(nextSort(null, 'priority')).toEqual({ key: 'priority', desc: true });
    expect(nextSort(null, 'updated')).toEqual({ key: 'updated', desc: true });
    expect(nextSort(null, 'name')).toEqual({ key: 'name', desc: false });
    expect(nextSort({ key: 'due', desc: true }, 'priority')).toEqual({
      key: 'priority',
      desc: true,
    });
    expect(isNatural({ key: 'priority', desc: true })).toBe(true);
    expect(isNatural({ key: 'priority', desc: false })).toBe(false);
  });
});

describe('parseSort', () => {
  it('takes only what makes sense', () => {
    expect(parseSort({ key: 'due', desc: true })).toEqual({ key: 'due', desc: true });
    expect(parseSort({ key: 'note', desc: true })).toBeNull();
    expect(parseSort({ key: 'due', desc: 'yes' })).toBeNull();
    expect(parseSort('due')).toBeNull();
    expect(parseSort(null)).toBeNull();
  });
});
