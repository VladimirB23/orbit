import { describe, expect, it } from 'vitest';
import { parseTreeSearch } from './search';

describe('parseTreeSearch', () => {
  it('reads a filter from the address', () => {
    expect(
      parseTreeSearch({
        q: 'kpi',
        view: 'overdue',
        status: ['done'],
        project: 'orbit',
        item: 'task-3',
      }),
    ).toEqual({ q: 'kpi', view: 'overdue', status: ['done'], project: 'orbit', item: 'task-3' });
  });

  it('drops anything unexpected instead of breaking the page', () => {
    expect(
      parseTreeSearch({
        q: 5,
        view: 'nope',
        status: ['done', 'x'],
        item: '"><b>',
        archived: 'yes',
      }),
    ).toEqual({ q: '5', status: ['done'] });
    expect(parseTreeSearch({})).toEqual({});
  });
});
