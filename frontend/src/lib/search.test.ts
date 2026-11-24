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

  it('knows the screen', () => {
    expect(parseTreeSearch({ screen: 'timeline' })).toEqual({ screen: 'timeline' });
    expect(parseTreeSearch({ screen: 'analytics' })).toEqual({ screen: 'analytics' });
    expect(parseTreeSearch({ screen: 'else' })).toEqual({});
  });

  it('knows the period of the analytics', () => {
    expect(parseTreeSearch({ period: '7d' })).toEqual({ period: '7d' });
    expect(parseTreeSearch({ period: 'all' })).toEqual({ period: 'all' });
    expect(parseTreeSearch({ period: '31d' })).toEqual({});
    const own = { from: '2026-11-01', to: '2026-11-10' };
    expect(parseTreeSearch(own)).toEqual(own);
    expect(parseTreeSearch({ from: '2026-13-01', to: 'soon' })).toEqual({});
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
