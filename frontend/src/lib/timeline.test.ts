import { describe, expect, it } from 'vitest';
import { milestone, project, task, tree } from '@/test-data';
import {
  barBox,
  dragDates,
  fits,
  grips,
  hint,
  labelWidth,
  laneItems,
  makeScale,
  pack,
  schedule,
  shiftDates,
  spanOf,
  ticks,
  withDates,
} from './timeline';
import { buildItems, type TreeItem } from './tree';

const TODAY = '2026-11-24';

type Input = Parameters<typeof milestone>[1];
function item(row: Input): TreeItem {
  const [root] = buildItems(tree([project(1, { milestones: [milestone(1, row)] })], TODAY));
  return root?.children[0] as TreeItem;
}
const span = (row: Input) => spanOf(item(row), TODAY);

describe('spanOf: what is drawn for a row', () => {
  it('draws nothing without any date', () => {
    expect(span({})).toBeNull();
    expect(span({ status: 'in_progress' })).toBeNull();
  });

  it('draws the plan from start to deadline', () => {
    expect(span({ start_date: '2026-11-28', due_date: '2026-12-04' })).toEqual({
      kind: 'bar',
      start: '2026-11-28',
      end: '2026-12-04',
      due: '2026-12-04',
      open: false,
      late: 0,
      delta: null,
    });
  });

  it('takes the real beginning when the plan has none', () => {
    const real = { start: '2026-11-11', end: null };
    expect(span({ status: 'in_progress', due_date: '2026-11-27', actual: real })).toMatchObject({
      kind: 'bar',
      start: '2026-11-11',
      end: '2026-11-27',
    });
  });

  it('prefers the beginning a person has set', () => {
    const real = { start: '2026-11-11', end: null };
    expect(span({ status: 'in_progress', start_date: '2026-11-05', actual: real })?.start).toBe(
      '2026-11-05',
    );
  });

  it('shows a lone deadline as a point, not as an invented bar', () => {
    expect(span({ due_date: '2026-11-30' })).toMatchObject({
      kind: 'point',
      start: '2026-11-30',
      end: '2026-11-30',
    });
  });

  it('goes on until today when there is no deadline', () => {
    const real = { start: '2026-11-11', end: null };
    expect(span({ status: 'in_progress', actual: real })).toMatchObject({
      end: TODAY,
      due: null,
      open: true,
    });
  });

  it('an open row that starts later begins there', () => {
    expect(span({ start_date: '2026-12-01' })).toMatchObject({
      kind: 'bar',
      start: '2026-12-01',
      end: '2026-12-01',
      open: true,
    });
  });

  it('counts the days after a missed deadline', () => {
    const real = { start: '2026-11-11', end: null };
    const late = span({ status: 'in_progress', due_date: '2026-11-21', actual: real });
    expect(late).toMatchObject({ end: '2026-11-21', late: 3 });
    expect(span({ due_date: '2026-11-21' })).toMatchObject({ kind: 'point', late: 3 });
    expect(span({ due_date: TODAY })).toMatchObject({ late: 0 });
  });

  it('a closed row ends when it was really closed, with the distance to the deadline', () => {
    const closed = (end: string) =>
      span({ status: 'done', due_date: '2026-11-08', actual: { start: '2026-11-03', end } });
    expect(closed('2026-11-10')).toMatchObject({
      kind: 'bar',
      end: '2026-11-10',
      due: '2026-11-08',
      delta: 2,
      late: 0,
    });
    expect(closed('2026-11-06')?.delta).toBe(-2);
    expect(closed('2026-11-08')?.delta).toBe(0);
  });

  it('a closed row with an unknown beginning is a point', () => {
    const actual = { start: null, end: '2026-11-12' };
    expect(span({ status: 'done', actual })).toMatchObject({ kind: 'point', end: '2026-11-12' });
  });

  it('a canceled row is not early or late', () => {
    const actual = { start: '2026-11-03', end: '2026-11-12' };
    expect(span({ status: 'canceled', due_date: '2026-11-08', actual })?.delta).toBeNull();
  });

  it('survives dates that contradict each other', () => {
    // Started after its own deadline.
    const real = { start: '2026-11-22', end: null };
    expect(span({ status: 'in_progress', due_date: '2026-11-20', actual: real })).toMatchObject({
      kind: 'point',
      start: '2026-11-20',
      late: 4,
    });
    // Planned to start after it was closed.
    const closed = { start: null, end: '2026-11-10' };
    expect(span({ status: 'done', start_date: '2026-11-20', actual: closed })).toMatchObject({
      kind: 'point',
      start: '2026-11-10',
    });
  });
});

describe('hint: the words next to a bar', () => {
  const words = (row: Input) => {
    const it = item(row);
    return hint(it, spanOf(it, TODAY), TODAY);
  };
  const ran = (end: string | null) => ({ start: '2026-11-03', end });

  it('tells the deadline, the delay or the result', () => {
    expect(words({ due_date: '2026-11-30' })).toEqual({ text: '30 ноя', bad: false });
    expect(words({ due_date: '2026-11-21' })).toEqual({ text: 'просрочено на 3 дня', bad: true });
    expect(words({ status: 'in_progress', actual: ran(null) })?.text).toBe('без срока');
    const done = (end: string) =>
      words({ status: 'done', due_date: '2026-11-08', actual: ran(end) });
    expect(done('2026-11-10')).toEqual({ text: '+2 дня', bad: true });
    expect(done('2026-11-07')).toEqual({ text: '−1 день', bad: false });
    expect(done('2026-11-08')).toEqual({ text: 'в срок', bad: false });
    expect(words({ status: 'done', actual: ran('2026-11-10') })?.text).toBe('10 ноя');
    expect(words({ status: 'canceled', actual: ran('2026-11-10') })?.text).toBe('отменено');
    expect(words({})).toBeNull();
  });
});

describe('makeScale', () => {
  const at = (days: string[], zoom: 'days' | 'weeks' | 'months' = 'weeks', view = 0) =>
    makeScale(days, TODAY, zoom, view);

  it('starts on a Monday and has room around everything', () => {
    const scale = at(['2026-10-28', '2026-12-04']);
    expect(new Date(`${scale.from}T00:00`).getDay()).toBe(1);
    expect(scale.from <= '2026-10-21').toBe(true);
    expect(scale.x('2026-12-04')).toBeLessThan(scale.width - 7 * scale.px);
    expect(scale.x(scale.from)).toBe(0);
  });

  it('always contains today, even with no dates at all', () => {
    const scale = at([]);
    expect(scale.x(TODAY)).toBeGreaterThan(0);
    expect(scale.x(TODAY)).toBeLessThan(scale.width);
  });

  it('fills a wide screen', () => {
    expect(at([], 'months', 3000).width).toBeGreaterThanOrEqual(3000);
  });

  it('a date typed with a wrong year does not stretch the screen to the horizon', () => {
    const scale = at(['1926-11-24', '2626-11-24']);
    expect(scale.days).toBeLessThan(365 * 5);
  });

  it('turns pixels back into days', () => {
    const scale = at([]);
    expect(scale.day(scale.x('2026-11-30'))).toBe('2026-11-30');
    expect(scale.day(scale.x('2026-11-30') + scale.px - 1)).toBe('2026-11-30');
    expect(scale.day(scale.x('2026-11-30') - 1)).toBe('2026-11-29');
  });
});

describe('ticks', () => {
  it('weeks: months above, Mondays below', () => {
    const { major, minor } = ticks(makeScale([], TODAY, 'weeks', 0), 'weeks');
    expect(minor.some((t) => t.label === '23 ноя')).toBe(true);
    expect(major.map((t) => t.label)).toContain('Декабрь 2026');
  });

  it('days: every day has a number, days off are marked', () => {
    const { minor } = ticks(makeScale([], TODAY, 'days', 0), 'days');
    const sunday = minor.find((t) => t.day === '2026-11-29');
    expect(sunday).toMatchObject({ label: '29', off: true });
    expect(minor.find((t) => t.day === TODAY)).toMatchObject({ off: false });
  });

  it('months: years above, months below', () => {
    const { major, minor } = ticks(makeScale([], TODAY, 'months', 0), 'months');
    expect(major.map((t) => t.label)).toContain('2026');
    expect(minor.map((t) => t.label)).toContain('дек');
  });

  it('the first month is named even when its first day is out of sight', () => {
    const scale = makeScale([], TODAY, 'weeks', 0);
    const { major } = ticks(scale, 'weeks');
    expect(major[0]?.x).toBe(0);
    for (const tick of major) expect(tick.x).toBeGreaterThanOrEqual(0);
  });
});

describe('barBox', () => {
  const scale = makeScale([], TODAY, 'weeks', 0);
  it('includes both the first and the last day', () => {
    const s = span({ start_date: '2026-11-25', due_date: '2026-11-27' });
    if (!s) throw new Error('no span');
    expect(barBox(s, scale)).toEqual({ left: scale.x('2026-11-25'), width: 3 * scale.px });
  });

  it('a day is visible at any zoom', () => {
    const far = makeScale([], TODAY, 'months', 0);
    const s = span({ start_date: '2026-11-25', due_date: '2026-11-25' });
    if (!s) throw new Error('no span');
    expect(barBox(s, far).width).toBeGreaterThanOrEqual(8);
  });
});

describe('labels', () => {
  it('a long title needs more room', () => {
    expect(labelWidth('Tableau dashboard')).toBeGreaterThan(labelWidth('CTEs'));
    expect(fits('CTEs', 80)).toBe(true);
    expect(fits('A very long name of a milestone', 80)).toBe(false);
  });
});

describe('pack: lanes of a folded project', () => {
  it('puts what does not touch into one lane', () => {
    expect(
      pack([
        [0, 10],
        [20, 30],
        [40, 50],
      ]),
    ).toEqual([0, 0, 0]);
  });
  it('moves what overlaps one lane down and comes back up', () => {
    expect(
      pack([
        [0, 100],
        [50, 120],
        [110, 160],
      ]),
    ).toEqual([0, 1, 0]);
  });
  it('keeps a gap between neighbours', () => {
    expect(
      pack(
        [
          [0, 10],
          [12, 20],
        ],
        4,
      ),
    ).toEqual([0, 1]);
  });
});

describe('laneItems: what a folded project shows', () => {
  it('its dated milestones', () => {
    const [root] = buildItems(
      tree([
        project(1, {
          milestones: [milestone(1, { due_date: '2026-11-30' }), milestone(2, {})],
          tasks: [task(3, { due_date: '2026-11-28' })],
        }),
      ]),
    );
    expect(laneItems(root as TreeItem, TODAY).map((i) => i.key)).toEqual(['milestone-1']);
  });

  it('its dated tasks when it has no milestones', () => {
    const [root] = buildItems(
      tree([project(1, { tasks: [task(3, { due_date: '2026-11-28' }), task(4, {})] })]),
    );
    expect(laneItems(root as TreeItem, TODAY).map((i) => i.key)).toEqual(['task-3']);
  });

  it('nothing inside an open row, a milestone or a task', () => {
    expect(laneItems(item({ tasks: [task(3, { due_date: '2026-11-28' })] }), TODAY)).toEqual([]);
  });
});

describe('grips: what can be dragged', () => {
  const of = (row: Input) => {
    const it = item(row);
    return grips(it, spanOf(it, TODAY));
  };
  it('a planned bar moves and stretches', () => {
    expect(of({ start_date: '2026-11-25', due_date: '2026-11-27' })).toEqual([
      'move',
      'start',
      'end',
    ]);
  });
  it('a lone deadline moves, and its left side pulls out a start', () => {
    expect(of({ due_date: '2026-11-27' })).toEqual(['move', 'start']);
  });
  it('a bar drawn only from facts has no dates to move, but its ends set them', () => {
    const actual = { start: '2026-11-03', end: null };
    expect(of({ status: 'in_progress', actual })).toEqual(['start', 'end']);
  });
  it('facts are not dragged', () => {
    const actual = { start: '2026-11-03', end: '2026-11-10' };
    expect(of({ status: 'done', due_date: '2026-11-08', actual })).toEqual([]);
  });
  it('an empty open row can be drawn on', () => {
    expect(of({})).toEqual(['draw']);
    expect(of({ status: 'canceled' })).toEqual([]);
  });
});

describe('dragDates', () => {
  const drag = (row: Input, grip: 'move' | 'start' | 'end', days: number) => {
    const it = item(row);
    const s = spanOf(it, TODAY);
    return s && dragDates(it, s, grip, days);
  };
  const plan = { start_date: '2026-11-25', due_date: '2026-11-27' };
  const ran = { status: 'in_progress' as const, actual: { start: '2026-11-11', end: null } };

  it('moves both dates', () => {
    expect(drag(plan, 'move', 5)).toEqual({ start_date: '2026-11-30', due_date: '2026-12-02' });
    expect(drag(plan, 'move', -30)).toEqual({ start_date: '2026-10-26', due_date: '2026-10-28' });
  });

  it('moves only what a person has set', () => {
    expect(drag({ ...ran, due_date: '2026-11-27' }, 'move', 2)).toEqual({ due_date: '2026-11-29' });
    expect(drag({ due_date: '2026-11-27' }, 'move', 2)).toEqual({ due_date: '2026-11-29' });
    expect(drag({ start_date: '2026-12-01' }, 'move', 2)).toEqual({ start_date: '2026-12-03' });
  });

  it('never moves a deadline before the real beginning', () => {
    expect(drag({ ...ran, due_date: '2026-11-27' }, 'move', -60)).toEqual({
      due_date: '2026-11-11',
    });
  });

  it('stretches one end, at least one day stays', () => {
    expect(drag(plan, 'end', 4)).toEqual({ due_date: '2026-12-01' });
    expect(drag(plan, 'end', -9)).toEqual({ due_date: '2026-11-25' });
    expect(drag(plan, 'start', -3)).toEqual({ start_date: '2026-11-22' });
    expect(drag(plan, 'start', 9)).toEqual({ start_date: '2026-11-27' });
  });

  it('gives a deadline to a bar without one', () => {
    expect(drag(ran, 'end', 6)).toEqual({ due_date: '2026-11-30' });
  });

  it('pulls a start out of a lone deadline', () => {
    expect(drag({ due_date: '2026-11-27' }, 'start', -2)).toEqual({ start_date: '2026-11-25' });
  });

  it('no movement is no change', () => {
    expect(drag(plan, 'move', 0)).toBeNull();
    expect(drag(plan, 'end', 0)).toBeNull();
    expect(drag({ start_date: '2026-11-25', due_date: '2026-11-25' }, 'end', -3)).toBeNull();
  });

  it('a press on a fact-drawn end sets the date only when moved', () => {
    expect(drag(ran, 'start', 0)).toBeNull();
    expect(drag(ran, 'start', 2)).toEqual({ start_date: '2026-11-13' });
  });
});

describe('schedule: drawing on an empty row', () => {
  it('works in both directions', () => {
    const range = { start_date: '2026-11-25', due_date: '2026-11-30' };
    expect(schedule('2026-11-25', '2026-11-30')).toEqual(range);
    expect(schedule('2026-11-30', '2026-11-25')).toEqual(range);
  });
});

describe('shiftDates: the same by keyboard', () => {
  it('moves the bar or only the deadline', () => {
    const plan = item({ start_date: '2026-11-25', due_date: '2026-11-27' });
    expect(shiftDates(plan, TODAY, 'move', 1)).toEqual({
      start_date: '2026-11-26',
      due_date: '2026-11-28',
    });
    expect(shiftDates(plan, TODAY, 'end', -1)).toEqual({ due_date: '2026-11-26' });
  });

  it('an empty row gets today as its deadline first', () => {
    expect(shiftDates(item({}), TODAY, 'end', 1)).toEqual({ due_date: TODAY });
    expect(shiftDates(item({}), TODAY, 'move', 1)).toBeNull();
  });

  it('moves the deadline of a lone point', () => {
    expect(shiftDates(item({ due_date: '2026-11-27' }), TODAY, 'end', 1)).toEqual({
      due_date: '2026-11-28',
    });
  });

  it('leaves closed rows alone', () => {
    const actual = { start: '2026-11-03', end: '2026-11-10' };
    expect(shiftDates(item({ status: 'done', actual }), TODAY, 'end', 1)).toBeNull();
  });
});

describe('withDates', () => {
  it('previews a change without touching the row', () => {
    const before = item({ due_date: '2026-11-27' });
    const after = withDates(before, { start_date: '2026-11-25' });
    expect([after.startDate, after.dueDate]).toEqual(['2026-11-25', '2026-11-27']);
    expect(before.startDate).toBeNull();
    expect(withDates(before, null)).toBe(before);
  });
});
