import { describe, expect, it } from 'vitest';
import type { OrbitEvent } from '@/api/types';
import { describeEvent, groupEvents, undoneText } from './history';

const event = (patch: Partial<OrbitEvent>): OrbitEvent => ({
  id: 1,
  at: '2026-11-24T10:00:00Z',
  actor: 'claude',
  entity: 'task',
  entity_id: 1,
  action: 'update',
  field: 'status',
  old_value: null,
  new_value: null,
  ...patch,
});

describe('describeEvent', () => {
  it('names statuses and priorities in words', () => {
    expect(describeEvent(event({ old_value: 'planned', new_value: 'in_progress' }))).toEqual({
      label: 'Статус',
      from: 'Запланировано',
      to: 'В работе',
    });
    expect(describeEvent(event({ field: 'priority', old_value: '0', new_value: '4' }))).toEqual({
      label: 'Приоритет',
      from: 'Без приоритета',
      to: 'Срочно',
    });
  });

  it('shows dates and an emptied field', () => {
    expect(
      describeEvent(event({ field: 'due_date', old_value: '2026-12-05', new_value: null })),
    ).toEqual({ label: 'Срок', from: '5 дек 2026', to: 'пусто' });
  });

  it('describes creation, deletion and the archive in one phrase', () => {
    expect(describeEvent(event({ action: 'create', field: null }))).toEqual({ label: 'Создано' });
    expect(describeEvent(event({ action: 'delete', field: null }))).toEqual({ label: 'Удалено' });
    expect(describeEvent(event({ field: 'archived_at', new_value: '2026-11-24' }))).toEqual({
      label: 'Отправлено в архив',
    });
    expect(describeEvent(event({ field: 'archived_at', old_value: '2026-11-24' }))).toEqual({
      label: 'Возвращено из архива',
    });
  });

  it('points to a milestone or a parent task by number', () => {
    expect(describeEvent(event({ field: 'milestone_id', old_value: '3', new_value: '4' }))).toEqual(
      { label: 'Этап', from: '#3', to: '#4' },
    );
  });

  it('keeps an unknown value readable instead of failing', () => {
    expect(describeEvent(event({ new_value: 'frozen' }))).toEqual({
      label: 'Статус',
      from: 'пусто',
      to: 'frozen',
    });
    expect(describeEvent(event({ field: 'estimate', new_value: '5' })).label).toBe('estimate');
  });
});

describe('groupEvents', () => {
  it('joins changes one author saved at the same moment', () => {
    const groups = groupEvents([
      event({ id: 4, at: '2026-11-24T10:00:01Z', field: 'status' }),
      event({ id: 3, at: '2026-11-24T10:00:00Z', field: 'due_date' }),
      event({ id: 2, at: '2026-11-24T10:00:00Z', actor: 'owner' }),
      event({ id: 1, at: '2026-11-23T10:00:00Z', actor: 'owner', action: 'create' }),
    ]);
    expect(groups.map((g) => [g.actor, g.events.map((e) => e.id)])).toEqual([
      ['claude', [4, 3]],
      ['owner', [2]],
      ['owner', [1]],
    ]);
  });
});

describe('undoneText', () => {
  const base = { entity: 'task' as const, id: 1, title: 'KPI', fields: [], count: 1 };
  it.each([
    [{ action: 'create' as const }, 'добавление «KPI»'],
    [{ action: 'delete' as const, count: 4 }, 'удаление «KPI» и все внутри (3)'],
    [{ action: 'update' as const, fields: ['status'] }, 'статус, «KPI»'],
    [{ action: 'update' as const, fields: ['due_date', 'start_date'] }, 'срок и старт, «KPI»'],
    [{ action: 'update' as const, fields: ['archived_at'] }, 'перенос в архив или из него, «KPI»'],
  ])('%j', (undone, text) => {
    expect(undoneText({ ...base, ...undone })).toBe(text);
  });
});
