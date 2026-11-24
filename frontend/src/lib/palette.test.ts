import { describe, expect, it } from 'vitest';
import { type Entry, rank } from './palette';

const entry = (title: string, rest: Partial<Entry> = {}): Entry => ({
  id: title,
  title,
  hint: '',
  keywords: '',
  closed: false,
  always: false,
  ...rest,
});
const titles = (entries: Entry[]) => entries.map((e) => e.title);

describe('rank', () => {
  it('without a query offers only what was marked for it', () => {
    const list = [entry('Orbit', { always: true }), entry('Some task')];
    expect(titles(rank(list, ' '))).toEqual(['Orbit']);
  });

  it('puts the start of the title first, then the start of a word, then the rest', () => {
    const list = [entry('Reorbit'), entry('The orbit'), entry('Orbit')];
    expect(titles(rank(list, 'orb'))).toEqual(['Orbit', 'The orbit', 'Reorbit']);
  });

  it('a match in the title beats a match in the path', () => {
    const list = [entry('Task', { hint: 'Orbit' }), entry('Read about orbit')];
    expect(titles(rank(list, 'orbit'))).toEqual(['Read about orbit', 'Task']);
  });

  it('closed things come after open ones of the same kind of match', () => {
    const list = [entry('API one', { closed: true }), entry('API two')];
    expect(titles(rank(list, 'api'))).toEqual(['API two', 'API one']);
  });

  it('every word must match, in any order and any field', () => {
    const list = [entry('Схема базы', { hint: 'Orbit', keywords: '#12' }), entry('Схема метро')];
    expect(titles(rank(list, 'orbit схема'))).toEqual(['Схема базы']);
    expect(titles(rank(list, '#12'))).toEqual(['Схема базы']);
    expect(rank(list, 'схема лес')).toEqual([]);
  });

  it('ignores case and the letter yo', () => {
    expect(titles(rank([entry('Учет')], 'УЧ\u0451Т'))).toEqual(['Учет']);
  });

  it('keeps the given order for equal matches and cuts a long list', () => {
    const list = Array.from({ length: 80 }, (_, i) => entry(`Task ${i}`));
    const found = titles(rank(list, 'task'));
    expect(found).toHaveLength(50);
    expect(found.slice(0, 3)).toEqual(['Task 0', 'Task 1', 'Task 2']);
  });

  it('finds a word typed in the wrong keyboard layout', () => {
    const list = [entry('Orbit'), entry('Поиск работы')];
    expect(titles(rank(list, 'щкише'))).toEqual(['Orbit']);
    expect(titles(rank(list, 'gjbcr'))).toEqual(['Поиск работы']);
  });

  it('what was typed wins over the other layout', () => {
    expect(titles(rank([entry('щкише'), entry('orbit')], 'щкише'))).toEqual(['щкише']);
  });
});
