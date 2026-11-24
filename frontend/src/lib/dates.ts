/** Deadlines are calendar days ("YYYY-MM-DD"), not moments: no time zones involved. */
import { differenceInCalendarDays, format, parseISO, addDays as shift } from 'date-fns';

export type Day = string;

const MONTHS = 'янв фев мар апр мая июн июл авг сен окт ноя дек'.split(' ');

export const toDate = (day: Day): Date => parseISO(day);
export const toDay = (date: Date): Day => format(date, 'yyyy-MM-dd');
export const addDays = (day: Day, days: number): Day => toDay(shift(toDate(day), days));
export const dayDiff = (a: Day, b: Day): number => differenceInCalendarDays(toDate(a), toDate(b));

const dayMonth = (date: Date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`;

export function formatDate(day: Day): string {
  const date = toDate(day);
  return `${dayMonth(date)} ${date.getFullYear()}`;
}

/** Short form for a cell: "сегодня", "5 дек", "1 мар 2027". */
export function formatDay(day: Day, today: Day): string {
  const diff = dayDiff(day, today);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  return day.slice(0, 4) === today.slice(0, 4) ? dayMonth(toDate(day)) : formatDate(day);
}

export function plural(n: number, one: string, few: string, many: string): string {
  const tens = n % 100;
  const units = n % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  return units >= 2 && units <= 4 ? few : many;
}

const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

export function dueHint(due: Day, today: Day): string {
  const diff = dayDiff(due, today);
  if (diff === 0) return 'срок сегодня';
  if (diff < 0) return `просрочено на ${days(-diff)}`;
  return `${plural(diff, 'остался', 'осталось', 'осталось')} ${days(diff)}`;
}

/** For the journal: moments come from the server in UTC and are shown in local time. */
export function relativeTime(at: string, now: Date = new Date()): string {
  const date = parseISO(at);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} ч назад`;
  return `${dayMonth(date)}, ${format(date, 'HH:mm')}`;
}

/** When a session happened, in local time. */
export function period(from: string, to: string): string {
  const start = parseISO(from);
  const end = parseISO(to);
  if (toDay(start) !== toDay(end)) return `${dayMonth(start)} – ${dayMonth(end)}`;
  return `${dayMonth(start)}, ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`;
}
