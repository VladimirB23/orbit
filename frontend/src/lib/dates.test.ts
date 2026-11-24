import { describe, expect, it } from 'vitest';
import { addDays, dayDiff, dueHint, formatDay, period, plural, relativeTime } from './dates';

const TODAY = '2026-11-24';

describe('formatDay', () => {
  it.each([
    ['2026-11-24', 'сегодня'],
    ['2026-11-25', 'завтра'],
    ['2026-11-23', 'вчера'],
    ['2026-12-05', '5 дек'],
    ['2027-03-01', '1 мар 2027'],
    ['2026-05-09', '9 мая'],
  ])('%s -> %s', (day, text) => {
    expect(formatDay(day, TODAY)).toBe(text);
  });
});

describe('dueHint', () => {
  it.each([
    ['2026-11-21', 'просрочено на 3 дня'],
    ['2026-11-23', 'просрочено на 1 день'],
    ['2026-11-13', 'просрочено на 11 дней'],
    ['2026-11-24', 'срок сегодня'],
    ['2026-11-26', 'осталось 2 дня'],
    ['2026-11-25', 'остался 1 день'],
  ])('%s -> %s', (day, text) => {
    expect(dueHint(day, TODAY)).toBe(text);
  });
});

describe('calendar arithmetic', () => {
  it('crosses months and daylight saving without drifting', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(dayDiff('2026-03-30', '2026-03-28')).toBe(2);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  it.each([
    ['2026-11-24T11:59:40Z', 'только что'],
    ['2026-11-24T11:55:00Z', '5 мин назад'],
    ['2026-11-24T09:00:00Z', '3 ч назад'],
  ])('%s -> %s', (at, text) => {
    expect(relativeTime(at, now)).toBe(text);
  });

  it('switches to the date after a day', () => {
    expect(relativeTime('2026-11-20T09:05:00Z', now)).toMatch(/^20 ноя, \d\d:\d\d$/);
  });
});

describe('period', () => {
  const at = (day: number, hour: number, minute: number) =>
    new Date(2026, 10, day, hour, minute).toISOString();

  it('one day: the day and the hours', () => {
    expect(period(at(24, 15, 4), at(24, 17, 15))).toBe('24 ноя, 15:04–17:15');
  });

  it('several days: only the days, a session resumed later did not last all night', () => {
    expect(period(at(21, 14, 40), at(23, 21, 24))).toBe('21 ноя – 23 ноя');
  });
});

describe('plural', () => {
  it('picks the Russian form by the number', () => {
    const files = (n: number) => `${n} ${plural(n, 'файл', 'файла', 'файлов')}`;
    expect([1, 3, 5, 11, 21, 112].map(files)).toEqual([
      '1 файл',
      '3 файла',
      '5 файлов',
      '11 файлов',
      '21 файл',
      '112 файлов',
    ]);
  });
});
