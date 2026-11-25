/** Where attention goes against where priorities ask for it. A table with bars in its cells. */
import { TriangleAlert } from 'lucide-react';
import type { FocusRow } from '@/api/types';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { PriorityMark } from '@/components/priority-mark';
import { quietText, splitFocus } from '@/lib/analytics';
import { type Day, plural } from '@/lib/dates';
import { PRIORITY_LABEL } from '@/lib/status';
import { cn } from '@/lib/utils';
import { Card, Note } from './card';

const percent = (share: number) => `${Math.round(share * 100)}%`;

interface Props {
  rows: FocusRow[];
  today: Day;
  className?: string;
  onOpen: (key: string) => void;
}

export function FocusChart({ rows, today, className, onOpen }: Props) {
  const { shown, silent, future } = splitFocus(rows);
  const top = Math.max(...shown.flatMap((row) => [row.share, row.expected ?? 0]), 0.01);
  const most = (pick: (row: FocusRow) => number) => Math.max(...shown.map(pick), 1);
  const sessions = most((row) => row.sessions);
  const commits = most((row) => row.commits);
  return (
    <Card
      className={className}
      title="Где фокус и где его не хватает"
      sub="Доля внимания проекта, черта: сколько ждали по приоритету"
      how={
        <>
          <p>
            Внимание = среднее двух долей: сессий Claude и коммитов за период. По одним сессиям
            проект с редкими, но большими сессиями выглядел бы заброшенным.
          </p>
          <p>
            Ожидание: каждый день внимание делится по приоритету между проектами, которые уже
            начались и еще идут. Проект трех недель не отвечает за три месяца. Без приоритета
            считается как низкий, коммитов ждем только от проектов с кодом. Меньше половины ожидания
            - мало внимания.
          </p>
          <p>
            Будущий проект (папки еще нет) внимания не ждет. Сессия считается один раз: у проекта, о
            котором она была, а не у того, где шла.
          </p>
          <p>
            Движение: последняя сессия, коммит или смена статуса. Правка сроков и текста движением
            не считается.
          </p>
        </>
      }
    >
      {shown.length === 0 ? (
        <Note>Ни один проект не в работе, и за период ничего не происходило.</Note>
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-y-0.5 text-sm">
          <thead>
            <tr className="text-left text-muted-foreground text-xs">
              <th scope="col" className="w-[42%] pb-1 font-normal @sm:w-[34%] @xl:w-[30%]">
                Проект
              </th>
              <th scope="col" className="pb-1 font-normal">
                Внимание
              </th>
              <th scope="col" className="w-16 pb-1 pl-3 text-right font-normal @sm:w-18">
                Сессии
              </th>
              <th scope="col" className="w-18 pb-1 pl-3 text-right font-normal @sm:w-20">
                Коммиты
              </th>
              <th
                scope="col"
                className="hidden w-30 pb-1 pl-3 text-right font-normal @lg:table-cell"
              >
                Движение
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <Row
                key={row.slug}
                row={row}
                today={today}
                scale={{ top, sessions, commits }}
                onOpen={onOpen}
              />
            ))}
          </tbody>
        </table>
      )}
      {silent.length > 0 && (
        <Note>
          Без активности и не в работе, {silent.length}{' '}
          {plural(silent.length, 'проект', 'проекта', 'проектов')}:{' '}
          {silent.map((row) => row.name).join(', ')}
        </Note>
      )}
      {future.length > 0 && (
        <Note>
          Будущие проекты, внимания пока не ждут: {future.map((row) => row.name).join(', ')}
        </Note>
      )}
    </Card>
  );
}

interface RowProps {
  row: FocusRow;
  today: Day;
  scale: { top: number; sessions: number; commits: number };
  onOpen: (key: string) => void;
}

function Row({ row, today, scale, onOpen }: RowProps) {
  const quiet = quietText(row, today);
  const low = row.attention === 'low';
  const why = [
    `${percent(row.sessions_share)} сессий и ${percent(row.commits_share)} коммитов`,
    row.expected !== null && `ждали ${percent(row.expected)}`,
    `приоритет: ${(PRIORITY_LABEL[row.priority] ?? '').toLowerCase()}`,
  ].filter(Boolean);
  return (
    <tr>
      <th scope="row" className="py-1 pr-3 text-left font-normal">
        <button
          type="button"
          onClick={() => onOpen(`project-${row.id}`)}
          className="flex max-w-full items-center gap-2 rounded-sm text-left hover:underline"
        >
          <OrbitGlyph status={row.status} />
          <span className="min-w-0 truncate">{row.name}</span>
          {row.priority > 0 && <PriorityMark value={row.priority} className="@max-lg:hidden" />}
        </button>
      </th>
      <td className="py-1" data-tip={`${row.name}\n${why.join('\n')}`}>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="relative hidden h-3.5 min-w-8 flex-1 @sm:block">
            <span className="absolute inset-y-[3px] left-0 w-full rounded-sm bg-track/60" />
            <span
              className={cn(
                'absolute inset-y-0 left-0 rounded-r-sm',
                low ? 'bg-chart-work' : 'bg-chart-bar',
              )}
              style={{ width: `${(row.share / scale.top) * 100}%` }}
            />
            {row.expected !== null && (
              <span
                className="absolute -inset-y-0.5 w-[3px] -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card"
                style={{ left: `${(row.expected / scale.top) * 100}%` }}
              />
            )}
          </span>
          <span className="w-9 shrink-0 text-right font-medium">{percent(row.share)}</span>
        </span>
        {low && (
          <span className="mt-0.5 flex items-center gap-1 text-sun-ink text-xs">
            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            <span>
              <span className="@max-sm:sr-only">мало внимания, </span>
              ждали {percent(row.expected ?? 0)}
            </span>
          </span>
        )}
        {row.future && (
          <span className="mt-0.5 block text-muted-foreground text-xs">будущий проект</span>
        )}
        {!low && row.expected !== null && (
          <span className="sr-only">ждали {percent(row.expected)}</span>
        )}
      </td>
      <Amount value={row.sessions} top={scale.sessions} />
      <Amount value={row.commits} top={scale.commits} />
      <td className="hidden py-1 pl-3 text-right @lg:table-cell">
        <span
          className={cn(
            'whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs',
            quiet.late ? 'bg-sun-wash text-sun-ink' : 'text-muted-foreground',
          )}
        >
          {quiet.text}
        </span>
      </td>
    </tr>
  );
}

function Amount({ value, top }: { value: number; top: number }) {
  return (
    <td className="py-1 pl-3 text-right align-middle">
      <span className={cn(value === 0 && 'text-faint')}>{value}</span>
      <span aria-hidden="true" className="mt-0.5 block h-1 rounded-full bg-track/60">
        <span
          className="block h-1 rounded-full bg-chart-bar/80"
          style={{ width: `${(value / top) * 100}%` }}
        />
      </span>
    </td>
  );
}
