/** When attention went where: projects by time, the darker the more. */
import type { Analytics } from '@/api/types';
import {
  heatLevel,
  isRunning,
  labelEvery,
  type Step,
  stepLabel,
  stepTitle,
  topRows,
} from '@/lib/analytics';
import { plural } from '@/lib/dates';
import { usePersisted } from '@/lib/persisted';
import { cn } from '@/lib/utils';
import { Card, Note } from './card';

type Kind = 'sessions' | 'commits';

const KINDS: [Kind, string][] = [
  ['sessions', 'Сессии'],
  ['commits', 'Коммиты'],
];
const asKind = (value: unknown): Kind => (value === 'commits' ? 'commits' : 'sessions');
const STEP_WORD: Record<Step, string> = { day: 'дням', week: 'неделям', month: 'месяцам' };
const MOST_ROWS = 8;

const words = (kind: Kind, n: number) =>
  kind === 'sessions'
    ? `${n} ${plural(n, 'сессия', 'сессии', 'сессий')}`
    : `${n} ${plural(n, 'коммит', 'коммита', 'коммитов')}`;

export function ActivityChart({ data, className }: { data: Analytics; className?: string }) {
  const [kind, setKind] = usePersisted<Kind>('orbit.heat', 'sessions', asKind);
  const unit = data.step as Step;
  const rows = topRows(data.activity, MOST_ROWS);
  const totals = data.steps.map((_, i) => rows.reduce((sum, row) => sum + (row[kind][i] ?? 0), 0));
  const top = Math.max(...rows.flatMap((row) => row[kind]), 1);
  const busiest = totals.indexOf(Math.max(...totals));
  const peak = totals[busiest] ?? 0;
  const at = data.steps[busiest];
  return (
    <Card
      className={className}
      title={
        peak > 0 && at
          ? `Больше всего: ${stepTitle(at, unit, data.today)}, ${words(kind, peak)}`
          : `За период нет ${kind === 'sessions' ? 'сессий' : 'коммитов'}`
      }
      sub={`Куда уходило внимание по ${STEP_WORD[unit]}`}
      tools={
        <fieldset className="flex overflow-hidden rounded-md border border-border">
          <legend className="sr-only">Что считать</legend>
          {KINDS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={kind === value}
              onClick={() => setKind(() => value)}
              className={cn(
                'h-7 px-2.5 text-muted-foreground text-sm hover:text-foreground',
                kind === value && 'bg-selected font-medium text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </fieldset>
      }
      how={
        <>
          <p>
            Сессии из журналов Obsidian, день начала. Длительность не показана: сессия может висеть
            открытой сутки, это не часы работы.
          </p>
          <p>
            Коммиты из git папки проекта, все локальные ветки без слияний. Счетчик коммитов в
            журналах сессий неполный, поэтому он не используется.
          </p>
        </>
      }
    >
      {rows.length === 0 ? (
        <Note>Нет ни сессий, ни коммитов: выбери период подлиннее или другой проект.</Note>
      ) : (
        <section
          aria-label="Активность по времени"
          className="overflow-x-auto pb-1"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: it scrolls sideways, the keyboard too
          tabIndex={0}
        >
          <table
            className="w-full table-fixed border-separate border-spacing-0.5 text-xs [--names:7rem] @md:[--names:11rem]"
            style={{ minWidth: `calc(var(--names) + ${data.steps.length * 1.5 + 3}rem)` }}
          >
            <colgroup>
              <col className="w-(--names)" />
              {data.steps.map((step) => (
                <col key={step} />
              ))}
              <col className="w-11" />
            </colgroup>
            <thead>
              <tr className="text-muted-foreground">
                <th scope="col" className="text-left font-normal">
                  <span className="sr-only">Проект</span>
                </th>
                {data.steps.map((step, i) => (
                  <th key={step} scope="col" className="h-5 whitespace-nowrap font-normal">
                    <span className="sr-only">{stepTitle(step, unit, data.today)}</span>
                    <span aria-hidden="true" className="relative -mx-2 block">
                      {labelEvery(i, data.steps.length, 14) ? stepLabel(step, unit) : ''}
                    </span>
                  </th>
                ))}
                <th scope="col" className="pl-2 text-right font-normal">
                  всего
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slug ?? 'rest'}>
                  <th
                    scope="row"
                    className={cn(
                      'truncate pr-2 text-left font-normal text-sm',
                      row.slug === null && 'text-muted-foreground',
                    )}
                    title={row.name}
                  >
                    {row.name}
                  </th>
                  {data.steps.map((step, i) => {
                    const n = row[kind][i] ?? 0;
                    return (
                      <td
                        key={step}
                        data-tip={`${row.name}\n${stepTitle(step, unit, data.today)}\n${words(kind, n)}`}
                        className={cn(
                          'h-7 overflow-hidden rounded-[4px] text-center',
                          n ? `heat-${heatLevel(n, top)}` : 'bg-line',
                          isRunning(step, unit, data.today) &&
                            'outline-1 outline-input outline-dashed',
                        )}
                      >
                        {n || <span className="sr-only">0</span>}
                      </td>
                    );
                  })}
                  <td className="pl-2 text-right font-medium text-sm">
                    {row[kind].reduce((sum, n) => sum + n, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr className="text-muted-foreground">
                  <th scope="row" className="pr-2 text-left font-normal text-sm">
                    Всего
                  </th>
                  {data.steps.map((step, i) => (
                    <td key={step} className="h-6 text-center">
                      {totals[i] || ''}
                    </td>
                  ))}
                  <td className="pl-2 text-right font-medium text-foreground text-sm">
                    {totals.reduce((sum, n) => sum + n, 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      )}
    </Card>
  );
}
