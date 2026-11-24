/** The change journal in words. */
import type { Actor, OrbitEvent, Undone } from '@/api/types';
import { formatDate } from './dates';
import { isStatus, PRIORITY_LABEL, STATUS_LABEL } from './status';

export interface Change {
  label: string;
  from?: string;
  to?: string;
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Название',
  title: 'Название',
  slug: 'Код',
  status: 'Статус',
  priority: 'Приоритет',
  start_date: 'Старт',
  due_date: 'Срок',
  summary: 'Кратко',
  comment: 'Комментарий',
  obsidian_path: 'Заметка Obsidian',
  repo_path: 'Папка',
  github_url: 'GitHub',
  milestone_id: 'Этап',
  parent_id: 'Родительская задача',
  position: 'Порядок',
};

function words(field: string, value: string | null): string {
  if (value === null) return 'пусто';
  if (field === 'status' && isStatus(value)) return STATUS_LABEL[value];
  if (field === 'priority') return PRIORITY_LABEL[Number(value)] ?? value;
  if (field === 'start_date' || field === 'due_date') return formatDate(value);
  if (field === 'milestone_id' || field === 'parent_id') return `#${value}`;
  return value;
}

export function describeEvent(event: OrbitEvent): Change {
  if (event.action === 'create') return { label: 'Создано' };
  if (event.action === 'delete') return { label: 'Удалено' };
  const field = event.field ?? '';
  if (field === 'archived_at') {
    return { label: event.new_value === null ? 'Возвращено из архива' : 'Отправлено в архив' };
  }
  return {
    label: FIELD_LABEL[field] ?? field,
    from: words(field, event.old_value),
    to: words(field, event.new_value),
  };
}

export interface EventGroup {
  actor: Actor;
  at: string;
  events: OrbitEvent[];
}

const SAME_MOMENT_MS = 2000;

/** Changes saved together by one author read as one entry. Newest first, as from the API. */
export function groupEvents(events: OrbitEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  for (const event of events) {
    const last = groups.at(-1);
    const together =
      last !== undefined &&
      last.actor === event.actor &&
      Date.parse(last.at) - Date.parse(event.at) <= SAME_MOMENT_MS;
    if (together) last.events.push(event);
    else groups.push({ actor: event.actor, at: event.at, events: [event] });
  }
  return groups;
}

/** What an undo has taken back: "срок, «KPI design»". */
export function undoneText({ action, fields, title, count }: Undone): string {
  const inside = count > 1 ? ` и все внутри (${count - 1})` : '';
  const name = `«${title}»`;
  if (action === 'create') return `добавление ${name}`;
  if (action === 'delete') return `удаление ${name}${inside}`;
  if (fields.includes('archived_at')) return `перенос в архив или из него, ${name}`;
  const labels = new Set(fields.map((field) => (FIELD_LABEL[field] ?? field).toLowerCase()));
  return `${[...labels].join(' и ')}, ${name}`;
}
