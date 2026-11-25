import { describe, expect, it } from 'vitest';
import type { Analytics, FocusRow } from '@/api/types';
import { analytics, focusRow } from '@/test-data';
import {
  closedTitle,
  cycleBins,
  cycleTitle,
  deadlineTitle,
  deltaText,
  heatLevel,
  labelEvery,
  lateText,
  lead,
  niceTop,
  periodText,
  planTitle,
  quietText,
  resolvePeriod,
  splitFocus,
  stepLabel,
  stepTitle,
  topRows,
} from './analytics';

const TODAY = '2026-11-25';
const text = (data: Partial<Analytics>) =>
  lead(analytics(data))
    .map((part) => part.text)
    .join('');

describe('period', () => {
  it('is the last 30 days unless said otherwise', () => {
    expect(resolvePeriod({}, TODAY)).toEqual({ key: '30d', start: '2026-10-27', end: TODAY });
  });

  it('knows presets', () => {
    expect(resolvePeriod({ period: '7d' }, TODAY)).toMatchObject({ start: '2026-11-19' });
    expect(resolvePeriod({ period: '90d' }, TODAY)).toMatchObject({ start: '2026-08-28' });
    expect(resolvePeriod({ period: 'all' }, TODAY)).toEqual({
      key: 'all',
      start: null,
      end: TODAY,
    });
  });

  it('takes own dates over a preset', () => {
    expect(resolvePeriod({ period: '7d', from: '2026-11-01', to: '2026-11-10' }, TODAY)).toEqual({
      key: 'own',
      start: '2026-11-01',
      end: '2026-11-10',
    });
  });

  it('is said shortly', () => {
    expect(periodText('2026-10-27', '2026-11-25')).toBe('27 окт – 25 ноя 2026');
    expect(periodText('2025-12-30', '2026-11-25')).toBe('30 дек 2025 – 25 ноя 2026');
    expect(periodText('2026-11-25', '2026-11-25')).toBe('25 ноя 2026');
  });

  it('ignores half a period and a turned one', () => {
    expect(resolvePeriod({ from: '2026-11-01' }, TODAY).key).toBe('30d');
    expect(resolvePeriod({ from: '2026-11-10', to: '2026-11-01' }, TODAY).key).toBe('30d');
  });
});

describe('comparison with the period before', () => {
  const words = (value: number, before: number | null) => deltaText({ value, before }, 30);

  it('says how much more or less', () => {
    expect(words(36, 30)).toBe('на 6 больше, чем за 30 дней до этого');
    expect(words(3, 5)).toBe('на 2 меньше, чем за 30 дней до этого');
    expect(words(5, 5)).toBe('столько же, сколько за 30 дней до этого');
  });

  it('does not compare with what was not recorded', () => {
    expect(words(36, null)).toBe('сравнить не с чем: раньше записей нет');
  });

  it('does not boast of growth from zero', () => {
    expect(words(36, 0)).toBe('за 30 дней до этого записей не было');
    expect(words(0, 0)).toBe('и за 30 дней до этого тоже');
  });
});

describe('lead', () => {
  const row = (name: string, data: Partial<FocusRow>) => focusRow({ name, slug: name, ...data });

  it('names the main focus and where attention is missing', () => {
    const focus = [
      row('Cats', { share: 0.64, expected: 0.22, attention: 'high', sessions: 21 }),
      row('Jobs', { share: 0.04, expected: 0.34, attention: 'low', sessions: 1 }),
    ];
    expect(text({ focus })).toBe(
      'Основной фокус: Cats, 64% внимания. Мало внимания: Jobs, 4% при ожидаемых 34%.',
    );
  });

  it('lists several neglected projects, the most neglected first', () => {
    const focus = [
      row('A', { share: 0.9, expected: 0.2, attention: 'high', sessions: 9 }),
      row('B', { share: 0.08, expected: 0.3, attention: 'low', sessions: 1 }),
      row('C', { share: 0.02, expected: 0.5, attention: 'low', sessions: 1 }),
    ];
    expect(text({ focus })).toContain('Мало внимания: C, 2% при ожидаемых 50%; B, 8%');
  });

  it('praises an even split only when it can judge', () => {
    const fair = [
      row('A', { share: 0.5, expected: 0.5, attention: 'fair', sessions: 5 }),
      row('B', { share: 0.5, expected: 0.5, attention: 'fair', sessions: 5 }),
    ];
    expect(text({ focus: fair })).toBe(
      'Основной фокус: A, 50% внимания. Внимание распределено примерно по приоритетам.',
    );
    const few = [row('A', { share: 1, expected: 1, attention: 'unknown', sessions: 2 })];
    expect(text({ focus: few })).toBe(
      'Основной фокус: A, 100% внимания. Судить о распределении рано: мало сессий и коммитов.',
    );
  });

  it('under a filter speaks of one project', () => {
    const one = (data: Partial<FocusRow>) => lead(analytics({ focus: [row('Jobs', data)] }), true);
    const said = (data: Partial<FocusRow>) =>
      one(data)
        .map((part) => part.text)
        .join('');
    expect(said({ sessions: 1, commits: 5, share: 0.04, expected: 0.34, attention: 'low' })).toBe(
      'Jobs: 1 сессия и 5 коммитов, 4% внимания. Это мало: ждали 34%.',
    );
    expect(said({ sessions: 21, commits: 2, share: 0.6, expected: 0.2, attention: 'high' })).toBe(
      'Jobs: 21 сессия и 2 коммита, 60% внимания. Это больше, чем ждали (20%).',
    );
    expect(said({ sessions: 2, commits: 0, share: 1, attention: 'unknown' })).toBe(
      'Jobs: 2 сессии и 0 коммитов, 100% внимания.',
    );
    expect(said({})).toBe('Jobs: за этот период ни сессий, ни коммитов.');
  });

  it('says when nothing happened', () => {
    expect(text({ focus: [row('A', {})] })).toBe('За этот период нет ни сессий, ни коммитов.');
    expect(text({ focus: [] })).toBe('За этот период нет ни сессий, ни коммитов.');
  });
});

describe('focus', () => {
  it('keeps silent ideas out of the table', () => {
    const rows = [
      focusRow({ slug: 'a', status: 'in_progress', sessions: 3 }),
      focusRow({ slug: 'b', status: 'in_progress' }),
      focusRow({ slug: 'c', status: 'backlog', commits: 1 }),
      focusRow({ slug: 'd', status: 'backlog' }),
      focusRow({ slug: 'e', status: 'paused' }),
    ];
    const { shown, silent } = splitFocus(rows);
    expect(shown.map((r) => r.slug)).toEqual(['a', 'b', 'c']);
    expect(silent.map((r) => r.slug)).toEqual(['d', 'e']);
  });

  it('a future project is in the table only when something was going on about it', () => {
    const rows = [
      focusRow({ slug: 'real', status: 'in_progress' }),
      focusRow({ slug: 'talked', status: 'backlog', future: true, sessions: 2 }),
      focusRow({ slug: 'waiting', status: 'in_progress', future: true }),
      focusRow({ slug: 'idea', status: 'backlog', future: true }),
      focusRow({ slug: 'paused', status: 'paused' }),
    ];
    const { shown, silent, future } = splitFocus(rows);
    expect(shown.map((r) => r.slug)).toEqual(['real', 'talked']);
    expect(silent.map((r) => r.slug)).toEqual(['paused']);
    expect(future.map((r) => r.slug)).toEqual(['waiting', 'idea']);
  });

  it('a future project that stands still is not a problem', () => {
    const row = focusRow({ status: 'in_progress', future: true, last_day: '2026-10-01' });
    expect(quietText(row, TODAY).late).toBe(false);
  });

  it('a filter by project shows it even when it is silent', () => {
    expect(splitFocus([focusRow({ slug: 'd', status: 'backlog' })]).shown).toHaveLength(1);
  });

  it('says how long a project has stood still', () => {
    const quiet = (data: Partial<FocusRow>) => quietText(focusRow(data), TODAY);
    expect(quiet({ status: 'in_progress', last_day: TODAY })).toEqual({
      text: 'сегодня',
      late: false,
    });
    expect(quiet({ status: 'in_progress', last_day: '2026-11-24' }).text).toBe('вчера');
    expect(quiet({ status: 'in_progress', last_day: '2026-11-20' })).toEqual({
      text: '5 дней назад',
      late: false,
    });
    expect(quiet({ status: 'in_progress', last_day: '2026-11-18' })).toEqual({
      text: '7 дней назад',
      late: true,
    });
    // Standing still on purpose is not a problem.
    expect(quiet({ status: 'paused', last_day: '2026-10-01' }).late).toBe(false);
    expect(quiet({ status: 'in_progress', last_day: null })).toEqual({
      text: 'не начат',
      late: false,
    });
  });
});

describe('steps of time', () => {
  it('names a step shortly and in full', () => {
    expect(stepLabel('2026-11-23', 'day')).toBe('23.11');
    expect(stepLabel('2026-11-01', 'month')).toBe('ноя');
    expect(stepTitle('2026-11-23', 'week', '2026-11-25')).toBe('23–29 ноя, идет сейчас');
    expect(stepTitle('2026-11-16', 'week', '2026-11-25')).toBe('16–22 ноя');
    expect(stepTitle('2026-10-26', 'week', '2026-11-25')).toBe('26 окт – 1 ноя');
    expect(stepTitle('2026-11-24', 'day', '2026-11-25')).toBe('24 ноя');
    expect(stepTitle('2026-10-01', 'month', '2026-11-25')).toBe('окт 2026');
  });

  it('thins labels out, the last one always stays', () => {
    const shown = (n: number) => Array.from({ length: n }, (_, i) => labelEvery(i, n, 8));
    expect(shown(5).every(Boolean)).toBe(true);
    expect(shown(26).filter(Boolean).length).toBeLessThanOrEqual(8);
    expect(shown(26).at(-1)).toBe(true);
  });

  it('folds the tail of projects into one row', () => {
    const rows = ['a', 'b', 'c', 'd'].map((slug, i) => ({
      slug,
      name: slug,
      sessions: [i, 1],
      commits: [0, i],
    }));
    const folded = topRows(rows, 3);
    expect(folded.map((r) => r.name)).toEqual(['a', 'b', 'Остальные (2)']);
    expect(folded.at(-1)).toMatchObject({ slug: null, sessions: [5, 2], commits: [0, 5] });
    expect(topRows(rows, 4)).toHaveLength(4);
  });
});

describe('scales', () => {
  it('ends at a round number', () => {
    expect([0, 1, 3, 7, 11, 21, 48, 130].map(niceTop)).toEqual([4, 4, 4, 8, 12, 24, 48, 160]);
  });

  it('has five levels of heat, zero is its own', () => {
    expect([0, 1, 5, 10, 15, 20].map((v) => heatLevel(v, 20))).toEqual([0, 1, 1, 2, 3, 4]);
    expect(heatLevel(1, 1)).toBe(4);
  });
});

describe('titles say what the chart shows', () => {
  const due = (days: number, title = 'T') => ({
    entity: 'task',
    id: 1,
    project: 'a',
    title,
    status: 'planned' as const,
    due: TODAY,
    days,
  });

  it('deadlines', () => {
    expect(deadlineTitle([])).toBe('На две недели сроков нет');
    expect(deadlineTitle([due(1)])).toBe('Просрочек нет, ближайший срок завтра');
    expect(deadlineTitle([due(0)])).toBe('Просрочек нет, ближайший срок сегодня');
    expect(deadlineTitle([due(5)])).toBe('Просрочек нет, ближайший срок через 5 дней');
    expect(deadlineTitle([due(-5), due(-1), due(3)])).toBe('2 срока прошли');
    expect(deadlineTitle([due(-1)])).toBe('1 срок прошел');
  });

  it('closed tasks', () => {
    const title = (value: number, born: number) =>
      closedTitle(
        analytics({
          totals: {
            ...analytics({}).totals,
            closed: { value, before: null },
            born_closed: born,
          },
        }),
      );
    expect(title(25, 6)).toBe('Закрыто 25 задач, еще 6 записаны уже закрытыми');
    expect(title(1, 0)).toBe('Закрыта 1 задача');
    expect(title(0, 2)).toBe('Закрытых в работе нет, 2 записаны уже закрытыми');
    expect(title(0, 0)).toBe('За период ничего не закрыто');
  });

  it('days between the plan and the fact', () => {
    expect([-2, -1, 0, 1, 5].map(lateText)).toEqual([
      '−2 дня',
      '−1 день',
      'в срок',
      '+1 день',
      '+5 дней',
    ]);
  });

  it('cycle time', () => {
    const cycle = { ...analytics({}).cycle, known: 12, median: 3, p85: 8 };
    expect(cycleTitle(cycle)).toBe('Половина задач готова за 3 дня, 85% за 8 дней');
    expect(cycleTitle({ ...cycle, median: 1.5, p85: 2 })).toBe(
      'Половина задач готова за 1,5 дня, 85% за 2 дня',
    );
    expect(cycleTitle({ ...cycle, median: 0, p85: 0 })).toBe('Почти все закрыто в день начала');
    expect(cycleTitle({ ...cycle, known: 5 })).toBe('Cycle time: данных пока мало');
    expect(cycleTitle({ ...cycle, known: 0 })).toBe('Cycle time: считать не на чем');
  });

  it('plan and fact', () => {
    const plan = { ...analytics({}).plan, compared: 4, late: 1 };
    expect(planTitle(plan)).toBe('3 из 4 этапов закрыты в срок');
    expect(planTitle({ ...plan, late: 0 })).toBe('Все 4 этапа закрыты в срок');
    expect(planTitle({ ...plan, compared: 2 })).toBe('План и факт: данных пока мало');
    expect(planTitle({ ...plan, compared: 0, late: 0 })).toBe('План и факт: сравнивать нечего');
  });
});

describe('cycle time bins', () => {
  it('counts every task once', () => {
    const bins = cycleBins([0, 0, 1, 2, 3, 4, 7, 8, 14, 15, 90]);
    expect(bins.map((b) => [b.label, b.count])).toEqual([
      ['0', 2],
      ['1', 1],
      ['2', 1],
      ['3–4', 2],
      ['5–7', 1],
      ['8–14', 2],
      ['15+', 2],
    ]);
  });
});
