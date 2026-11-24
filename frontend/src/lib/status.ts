/** Words and order for statuses and priorities: one place for the whole interface. */
import type { Status } from '@/api/types';

export const STATUSES: Status[] = [
  'backlog',
  'planned',
  'in_progress',
  'paused',
  'blocked',
  'done',
  'canceled',
];

export const STATUS_LABEL: Record<Status, string> = {
  backlog: 'Идея',
  planned: 'Запланировано',
  in_progress: 'В работе',
  paused: 'На паузе',
  blocked: 'Заблокировано',
  done: 'Готово',
  canceled: 'Отменено',
};

export const PRIORITIES = [0, 1, 2, 3, 4] as const;

export const PRIORITY_LABEL: Record<number, string> = {
  0: 'Без приоритета',
  1: 'Низкий',
  2: 'Средний',
  3: 'Высокий',
  4: 'Срочно',
};

export const isClosed = (status: Status) => status === 'done' || status === 'canceled';

export const isStatus = (value: unknown): value is Status =>
  typeof value === 'string' && (STATUSES as string[]).includes(value);
