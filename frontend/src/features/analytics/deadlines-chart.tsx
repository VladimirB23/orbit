/** Overdue to the left of today, ahead to the right. */
import type { Analytics, Deadline } from '@/api/types';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { deadlineTitle, inDays } from '@/lib/analytics';
import { formatDay, plural } from '@/lib/dates';
import { STATUS_LABEL } from '@/lib/status';
import { cn } from '@/lib/utils';
import { Card, Note } from './card';

const FROM = -7;
const TO = 14;
const MOST = 12;
const HOT = 2;
const ENTITY: Record<string, string> = { project: 'проект', milestone: 'этап', task: 'задача' };

const place = (days: number) => ((Math.min(Math.max(days, FROM), TO) - FROM) / (TO - FROM)) * 100;

interface Props {
  data: Analytics;
  names: Map<string, string>;
  className?: string;
  onOpen: (key: string) => void;
}

export function DeadlinesChart({ data, names, className, onOpen }: Props) {
  const items = data.deadlines;
  const rest = items.length - MOST;
  return (
    <Card
      className={className}
      title={deadlineTitle(items)}
      sub="На сегодня: просрочено и ближайшие 14 дней"
      how={
        <p>
          Проекты, этапы и задачи со сроком, не закрытые и не отмененные. Период сверху на этот
          график не влияет: срок считается от сегодня. Оранжевый: осталось 2 дня или меньше.
        </p>
      }
    >
      {items.length === 0 ? (
        <Note>Просрочек нет, на две недели вперед сроков тоже.</Note>
      ) : (
        <ul className="relative">
          <li
            aria-hidden="true"
            className="@max-md:hidden grid grid-cols-[minmax(0,1fr)_auto] @md:grid-cols-[minmax(0,1fr)_34%_auto] gap-x-3"
          >
            <span />
            <span className="relative h-5 text-muted-foreground text-xs">
              <span className="absolute -translate-x-1/2" style={{ left: `${place(0)}%` }}>
                сегодня
              </span>
              <span className="absolute right-0">+14</span>
            </span>
            <span className="w-28" />
          </li>
          {items.slice(0, MOST).map((item) => (
            <Row
              key={`${item.entity}-${item.id}`}
              item={item}
              project={names.get(item.project) ?? item.project}
              today={data.today}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
      {rest > 0 && (
        <Note>
          Еще {rest} {plural(rest, 'срок', 'срока', 'сроков')}: все видны в дереве по кнопкам
          "Просрочено" и "Ближайшие 7 дней".
        </Note>
      )}
    </Card>
  );
}

interface RowProps {
  item: Deadline;
  project: string;
  today: string;
  onOpen: (key: string) => void;
}

function Row({ item, project, today, onOpen }: RowProps) {
  const late = item.days < 0;
  const zero = place(0);
  const at = place(item.days);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] @md:grid-cols-[minmax(0,1fr)_34%_auto] items-center gap-x-3 text-sm">
      <button
        type="button"
        onClick={() => onOpen(`${item.entity}-${item.id}`)}
        className="flex min-w-0 items-center gap-2 rounded-sm py-1 text-left hover:underline"
      >
        <OrbitGlyph status={item.status} />
        <span className="min-w-0">
          <span className="block truncate leading-tight">{item.title}</span>
          <span className="block truncate text-muted-foreground text-xs">
            {item.entity === 'project' ? 'проект' : project}
            {item.status === 'paused' || item.status === 'blocked'
              ? `, ${STATUS_LABEL[item.status].toLowerCase()}`
              : ''}
          </span>
        </span>
      </button>
      <span
        aria-hidden="true"
        className="relative h-full @max-md:hidden"
        data-tip={`${item.title}\n${ENTITY[item.entity]}, ${formatDay(item.due, today)}`}
      >
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <span
          className={cn(
            'absolute top-1/2 h-2.5 -translate-y-1/2',
            late && 'rounded-l-sm bg-chart-late',
            !late && 'rounded-r-sm',
            !late && (item.days <= HOT ? 'bg-chart-work' : 'bg-chart-bar'),
          )}
          style={
            late
              ? { left: `${at}%`, width: `${zero - at}%` }
              : { left: `${zero}%`, width: `max(${at - zero}%, 3px)` }
          }
        />
        <span
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-input"
          style={{ left: `${zero}%` }}
        />
      </span>
      <span className="w-28 text-right">
        <span className={cn('block font-medium leading-tight', late && 'text-danger')}>
          {inDays(item.days)}
        </span>
        {Math.abs(item.days) > 1 && (
          <span className="block text-muted-foreground text-xs">{formatDay(item.due, today)}</span>
        )}
      </span>
    </li>
  );
}
