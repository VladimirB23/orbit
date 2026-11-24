import { describe, expect, it } from 'vitest';
import {
  type ColumnSettings,
  columnsOf,
  DEFAULT_COLUMNS,
  isShown,
  parseColumns,
  resetColumn,
  setWidth,
  showColumn,
  timelineLayout,
  treeLayout,
} from './columns';

const ids = (layout: { columns: { id: string }[] }) => layout.columns.map((c) => c.id);
const NONE = DEFAULT_COLUMNS;

describe('what is shown', () => {
  it('starts with the usual set of each screen', () => {
    expect(ids(treeLayout(NONE, 1400))).toEqual(['status', 'progress', 'start', 'due', 'note']);
    expect(ids(timelineLayout(NONE, 1400))).toEqual(['due']);
  });

  it('a person hides and adds fields', () => {
    let s = showColumn(NONE, 'progress', false);
    s = showColumn(s, 'priority', true);
    expect(ids(treeLayout(s, 1400))).toEqual(['status', 'priority', 'start', 'due', 'note']);
    expect(isShown(s, 'progress', 'tree')).toBe(false);
  });

  it('offers every field for choosing', () => {
    expect(columnsOf().map((c) => c.id)).toContain('updated');
    for (const column of columnsOf()) expect(column.label).not.toBe('');
  });

  it('a field added in a future version follows its own default', () => {
    const saved = parseColumns({ width: {}, shown: { status: false } });
    expect(isShown(saved, 'due', 'tree')).toBe(true);
    expect(isShown(saved, 'updated', 'tree')).toBe(false);
  });
});

describe('a narrow screen', () => {
  it('gives up less important fields first', () => {
    expect(ids(treeLayout(NONE, 1000))).toEqual(['status', 'progress', 'due', 'note']);
    expect(ids(treeLayout(NONE, 800))).toEqual(['status', 'progress', 'due']);
    expect(ids(treeLayout(NONE, 400))).toEqual(['status', 'due']);
    expect(treeLayout(NONE, 400).compact).toBe(true);
    expect(ids(timelineLayout(NONE, 600))).toEqual([]);
  });

  it('by default nothing sticks out', () => {
    for (let width = 320; width <= 2000; width += 10) {
      expect(treeLayout(NONE, width).minWidth).toBeLessThanOrEqual(width);
    }
  });

  it('on a phone the chosen widths wait for a bigger screen', () => {
    const s = setWidth(NONE, 'name', 900);
    expect(treeLayout(s, 400).minWidth).toBeLessThanOrEqual(400);
  });
});

describe('widths', () => {
  it('a chosen width wins', () => {
    const s = setWidth(setWidth(NONE, 'name', 500), 'due', 140);
    const { template } = treeLayout(s, 1400);
    expect(template.startsWith('500px ')).toBe(true);
    expect(template).toContain('140px');
  });

  it('free room goes to the comment, or to the end when there is none', () => {
    const wide = setWidth(NONE, 'name', 400);
    expect(treeLayout(wide, 1400).template).toContain('1fr');
    const bare = showColumn(wide, 'note', false);
    expect(treeLayout(bare, 1400).template).toMatch(/minmax\(34px, 1fr\)$/);
  });

  it('never gets smaller than a finger can grab, nor eats the whole screen', () => {
    expect(setWidth(NONE, 'due', 1).width.due).toBeGreaterThanOrEqual(40);
    expect(setWidth(NONE, 'name', -50).width.name).toBeGreaterThanOrEqual(100);
    const huge = setWidth(NONE, 'name', 99_999);
    expect(Number.parseInt(treeLayout(huge, 1400).template, 10)).toBeLessThanOrEqual(1400);
  });

  it('a wide name makes the tree scroll rather than lose fields', () => {
    const layout = treeLayout(setWidth(NONE, 'name', 900), 1200);
    expect(layout.minWidth).toBeGreaterThan(1200);
    expect(ids(layout)).toContain('start');
  });

  it('goes back to the usual width', () => {
    const s = resetColumn(setWidth(NONE, 'due', 200), 'due');
    expect(s).toEqual(NONE);
  });
});

describe('the names of the timeline', () => {
  it('the chart starts after the names and the shown fields', () => {
    const plain = timelineLayout(NONE, 1400);
    const wide = timelineLayout(setWidth(NONE, 'name', 500), 1400);
    expect(wide.width - plain.width).toBe(500 - plain.name);
    const more = timelineLayout(showColumn(NONE, 'progress', true), 1400);
    expect(more.width).toBeGreaterThan(plain.width);
  });

  it('always leaves room for the chart', () => {
    for (const width of [360, 700, 1000, 1400]) {
      let s: ColumnSettings = setWidth(NONE, 'name', 3000);
      for (const column of columnsOf()) s = showColumn(s, column.id, true);
      expect(timelineLayout(s, width).width).toBeLessThanOrEqual(width * 0.75);
    }
  });
});

describe('parseColumns: what the browser has kept', () => {
  it('keeps what makes sense and drops the rest', () => {
    expect(
      parseColumns({
        width: { name: 300, due: 'wide', nope: 5, status: Number.NaN },
        shown: { status: false, nope: true, due: 'yes' },
      }),
    ).toEqual({ width: { name: 300 }, shown: { status: false } });
  });

  it('survives anything', () => {
    for (const raw of [null, undefined, 5, 'x', [], { width: 3, shown: null }]) {
      expect(parseColumns(raw)).toEqual(DEFAULT_COLUMNS);
    }
  });
});
