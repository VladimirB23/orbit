/** Headline numbers. Every one says what it is compared with, or that there is nothing to compare. */
import type { Analytics, Measure } from '@/api/types';
import { deltaText, inDays, isRunning, type Step, splitFocus } from '@/lib/analytics';
import { dayDiff, plural } from '@/lib/dates';
import { cn } from '@/lib/utils';

export function Tiles({ data }: { data: Analytics }) {
  const { totals, focus, deadlines } = data;
  const days = dayDiff(data.end, data.start) + 1;
  const sum = (pick: 'sessions' | 'commits') =>
    data.steps.map((_, i) => data.activity.reduce((n, row) => n + (row[pick][i] ?? 0), 0));

  const working = splitFocus(focus).shown.filter((row) => row.status === 'in_progress');
  const touched = working.filter((row) => row.sessions + row.commits + row.closed > 0);
  const low = working.filter((row) => row.attention === 'low').map((row) => row.name);
  const late = deadlines.filter((item) => item.days < 0);
  const next = deadlines.find((item) => item.days >= 0);

  return (
    <dl className="grid grid-cols-2 gap-3 @2xl/page:grid-cols-3 @5xl/page:grid-cols-5">
      <Counted
        data={data}
        name="Сессии Claude"
        measure={totals.sessions}
        line={sum('sessions')}
        days={days}
      />
      <Counted
        data={data}
        name="Коммиты"
        measure={totals.commits}
        line={sum('commits')}
        days={days}
      />
      <Counted
        data={data}
        name="Закрыто задач"
        measure={totals.closed}
        line={data.closed}
        days={days}
      />
      <Tile
        name="Проекты с движением"
        value={working.length ? `${touched.length} из ${working.length}` : '0'}
        note={
          low.length
            ? `мало внимания: ${low.join(', ')}`
            : working.length
              ? 'без явно забытых'
              : 'ни один проект не в работе'
        }
      />
      <Tile
        name="Просрочено"
        value={String(late.length)}
        bad={late.length > 0}
        note={
          next
            ? `ближайший срок ${inDays(next.days)}: ${next.title}`
            : `на две недели ${plural(0, 'срок', 'срока', 'сроков')} нет`
        }
      />
    </dl>
  );
}

interface CountedProps {
  data: Analytics;
  name: string;
  measure: Measure;
  line: number[];
  days: number;
}

function Counted({ data, name, measure, line, days }: CountedProps) {
  const top = Math.max(...line, 1);
  return (
    <Tile name={name} value={String(measure.value)} note={deltaText(measure, days)}>
      {line.length > 1 && (
        <span aria-hidden="true" className="flex h-8 w-20 shrink-0 items-end gap-px">
          {data.steps.map((step, i) => (
            <span
              key={step}
              className={cn(
                'min-w-px flex-1 rounded-t-[2px]',
                line[i] ? 'bg-chart-bar' : 'bg-track',
                isRunning(step, data.step as Step, data.today) && 'opacity-60',
              )}
              style={{ height: `${Math.max(((line[i] ?? 0) / top) * 100, 6)}%` }}
            />
          ))}
        </span>
      )}
    </Tile>
  );
}

interface TileProps {
  name: string;
  value: string;
  note: string;
  bad?: boolean;
  children?: React.ReactNode;
}

function Tile({ name, value, note, bad = false, children }: TileProps) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-card px-4 py-3">
      <dt className="text-muted-foreground text-sm">{name}</dt>
      <dd className="mt-0.5 flex flex-1 flex-col">
        <span className="flex items-end justify-between gap-3">
          <span
            className={cn(
              'font-semibold text-3xl proportional-nums leading-tight tracking-tight',
              bad && 'text-danger',
            )}
          >
            {value}
          </span>
          {children}
        </span>
        <span className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-snug" title={note}>
          {note}
        </span>
      </dd>
    </div>
  );
}
