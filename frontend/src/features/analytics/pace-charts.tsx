/** How work goes, for a look once a week: closed tasks, cycle time, plan and fact, statuses. */
import type { Analytics, FocusRow } from '@/api/types';
import {
  closedTitle,
  cycleBins,
  cycleTitle,
  isRunning,
  labelEvery,
  lateText,
  planTitle,
  type Step,
  stepLabel,
  stepTitle,
} from '@/lib/analytics';
import { formatDay, plural } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Card, Legend, Need, Note } from './card';
import { type Column, Columns } from './columns-chart';

const tasks = (n: number) => `${n} ${plural(n, 'задача', 'задачи', 'задач')}`;

// --- closed ------------------------------------------------------------------

const STEPS_NEEDED = 3;

export function ClosedChart({ data, className }: { data: Analytics; className?: string }) {
  const unit = data.step as Step;
  const count = data.steps.length;
  const total = (i: number) => (data.closed[i] ?? 0) + (data.born_closed[i] ?? 0);
  const peak = Math.max(...data.steps.map((_, i) => total(i)), 0);
  const busy = data.closed.filter((n) => n > 0).length;
  const columns = data.steps.map((step, i): Column => {
    const closed = data.closed[i] ?? 0;
    const born = data.born_closed[i] ?? 0;
    const name = stepTitle(step, unit, data.today);
    return {
      key: step,
      label: labelEvery(i, count, 8) ? stepLabel(step, unit) : '',
      title: `${name}\nзакрыто: ${closed}${born ? `\nзаписано уже закрытыми: ${born}` : ''}`,
      value: closed,
      extra: born,
      pale: isRunning(step, unit, data.today),
      shown: total(i) > 0 && (count <= 14 || total(i) === peak || i === count - 1),
    };
  });
  return (
    <Card
      className={className}
      title={closedTitle(data)}
      sub="Закрытые задачи; текущий отрезок бледный"
      how={
        <p>
          Задача попадает в день последнего закрытия. Созданные сразу закрытыми - запись прошлого, а
          не скорость, поэтому они отдельно и штриховкой. Архивные проекты учитываются: работа была.
        </p>
      }
    >
      {peak === 0 ? (
        <Note>За период задачи не закрывались.</Note>
      ) : (
        <>
          {data.totals.born_closed > 0 && (
            <Legend
              items={[
                ['bg-chart-done', 'Закрыты'],
                ['born-closed', 'Созданы сразу закрытыми'],
              ]}
            />
          )}
          <Columns columns={columns} />
          {busy < STEPS_NEEDED && count >= STEPS_NEEDED && (
            <Note>
              Закрытия есть только на {busy} {plural(busy, 'отрезке', 'отрезках', 'отрезках')} из{' '}
              {count}: о темпе судить рано.
            </Note>
          )}
        </>
      )}
    </Card>
  );
}

// --- cycle time --------------------------------------------------------------

export function CycleChart({ data, className }: { data: Analytics; className?: string }) {
  const { cycle } = data;
  const left = [
    cycle.no_start && `${cycle.no_start} закрыты без статуса "в работе"`,
    cycle.born_closed && `${cycle.born_closed} созданы сразу закрытыми`,
  ].filter(Boolean);
  const enough = cycle.known >= cycle.needed;
  const sameDay = cycle.known > 0 && cycle.items.every((item) => item.days === 0);
  return (
    <Card
      className={className}
      title={cycleTitle(cycle)}
      sub={'Дней от "в работе" до "готово"'}
      how={
        <p>
          Начало: первый раз "в работе", конец: последнее закрытие, в календарных днях. Задача без
          известного начала не считается и не угадывается. Медиана (середина ряда) показывается от{' '}
          {cycle.needed} задач: на меньшем числе она скачет от каждой новой.
        </p>
      }
    >
      {enough ? (
        <Columns
          axis={false}
          columns={cycleBins(cycle.items.map((item) => item.days)).map((bin) => ({
            key: bin.label,
            label: bin.label === '0' ? '0 дн.' : bin.label,
            title: `${bin.label} дн.: ${tasks(bin.count)}`,
            value: bin.count,
            shown: bin.count > 0,
          }))}
        />
      ) : (
        <Need have={cycle.known} of={cycle.needed}>
          <b className="font-semibold">
            Известно начало у {cycle.known} из нужных {cycle.needed}.
          </b>{' '}
          {sameDay
            ? 'Все закрыты в день начала: пока это скорость записи в трекер, а не работы.'
            : cycle.known > 0
              ? `Дней: ${cycle.items.map((item) => item.days).join(', ')}.`
              : 'Переводи задачи в "В работе", когда берешься за них.'}
        </Need>
      )}
      {left.length > 0 && <Note>Не вошли: {left.join(', ')}.</Note>}
    </Card>
  );
}

// --- plan and fact -------------------------------------------------------------

const MOST_PLANS = 8;

interface PlanProps {
  data: Analytics;
  names: Map<string, string>;
  className?: string;
  onOpen: (key: string) => void;
}

export function PlanChart({ data, names, className, onOpen }: PlanProps) {
  const { plan, today } = data;
  // The latest first when all fit; otherwise those that were late the most.
  const all = plan.items.length > MOST_PLANS;
  const items = all
    ? [...plan.items].sort((a, b) => b.days - a.days).slice(0, MOST_PLANS)
    : plan.items;
  const top = Math.max(...items.map((item) => Math.abs(item.days)), 2);
  const left = [
    plan.no_due && `${plan.no_due} без срока`,
    plan.set_after && `${plan.set_after} со сроком, поставленным после закрытия`,
    plan.born_closed && `${plan.born_closed} созданы сразу закрытыми`,
  ].filter(Boolean);
  return (
    <Card
      className={className}
      title={planTitle(plan)}
      sub="Закрытые этапы: на сколько дней позже или раньше срока"
      how={
        <p>
          План: срок, который стоял в журнале до закрытия. Перенос и срок задним числом план не
          улучшают. Сравниваем от {plan.needed} этапов.
        </p>
      }
    >
      {plan.compared < plan.needed && (
        <Need have={plan.compared} of={plan.needed}>
          <b className="font-semibold">
            Сравнимых этапов {plan.compared} из нужных {plan.needed}.
          </b>{' '}
          Нужен срок, поставленный до закрытия.
        </Need>
      )}
      {items.length > 0 && (
        <ul className={cn('space-y-0.5 text-sm', plan.compared < plan.needed && 'mt-3')}>
          {items.map((item) => {
            const late = item.days > 0;
            const width = `${(Math.abs(item.days) / top) * 26}%`;
            return (
              <li key={item.milestone_id} className="grid grid-cols-[40%_minmax(0,1fr)] gap-x-3">
                <button
                  type="button"
                  onClick={() => onOpen(`milestone-${item.milestone_id}`)}
                  className="min-w-0 rounded-sm py-0.5 text-left hover:underline"
                >
                  <span className="block truncate leading-tight">{item.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {names.get(item.project) ?? item.project}
                  </span>
                </button>
                <span
                  className="relative"
                  data-tip={`${item.name}\nсрок ${formatDay(item.due, today)}, закрыт ${formatDay(item.done, today)}${
                    item.moves
                      ? `\nсрок переносили: ${item.moves} ${plural(item.moves, 'раз', 'раза', 'раз')}`
                      : ''
                  }${item.automatic ? '\nсрок поставлен автоматически' : ''}`}
                >
                  <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-input" />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-1/2 h-2.5 -translate-y-1/2',
                      late
                        ? 'left-1/2 rounded-r-sm bg-chart-late'
                        : 'right-1/2 rounded-l-sm bg-chart-done',
                    )}
                    style={{ width }}
                  />
                  <span
                    className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs"
                    style={
                      late
                        ? { left: `calc(50% + ${width} + 0.4rem)` }
                        : { right: `calc(50% + ${width} + 0.4rem)` }
                    }
                  >
                    {lateText(item.days)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {plan.compared > MOST_PLANS && (
        <Note>
          Показаны {MOST_PLANS} самых поздних из {plan.compared}.
        </Note>
      )}
      {left.length > 0 && <Note>Не вошли: {left.join(', ')}.</Note>}
      {plan.automatic > 0 && (
        <Note>
          У {plan.automatic} {plural(plan.automatic, 'этапа', 'этапов', 'этапов')} срок поставлен
          автоматически.
        </Note>
      )}
    </Card>
  );
}

// --- statuses ------------------------------------------------------------------

const PARTS = [
  ['done', 'Готово', 'bg-chart-done'],
  ['working', 'В работе', 'bg-chart-work'],
  ['stuck', 'Стоит (пауза, блок)', 'bg-chart-stuck'],
  ['ahead', 'Впереди', 'bg-track'],
] as const;

export function StatusesChart({ rows, className }: { rows: FocusRow[]; className?: string }) {
  const all = (row: FocusRow) => PARTS.reduce((sum, [key]) => sum + row[key], 0);
  const shown = rows.filter((row) => !row.archived && all(row) > 0);
  const empty = rows.filter((row) => !row.archived && all(row) === 0).length;
  const stuck = shown.reduce((sum, row) => sum + row.stuck, 0);
  const working = shown.reduce((sum, row) => sum + row.working, 0);
  return (
    <Card
      className={className}
      title={
        stuck > 0
          ? `В работе ${tasks(working)}, стоит ${stuck}`
          : working > 0
            ? `В работе ${tasks(working)}, ничего не стоит`
            : 'Ни одна задача не в работе'
      }
      sub="На сегодня: задачи проектов по статусам"
      how={
        <p>
          Отмененные задачи не считаются. Период сверху на этот график не влияет: это состояние на
          сегодня. "Стоит" - на паузе или заблокировано.
        </p>
      }
    >
      {shown.length === 0 ? (
        <Note>В проектах пока нет задач.</Note>
      ) : (
        <>
          <Legend items={PARTS.map(([, label, swatch]) => [swatch, label])} />
          <ul className="space-y-1 text-sm">
            {shown.map((row) => (
              <li
                key={row.slug}
                className="grid grid-cols-[40%_minmax(0,1fr)_4.5rem] items-center gap-x-3"
              >
                <span className="truncate" title={row.name}>
                  {row.name}
                </span>
                <span aria-hidden="true" className="flex h-3.5 gap-0.5">
                  {PARTS.map(([key, label, swatch]) =>
                    row[key] > 0 ? (
                      <span
                        key={key}
                        data-tip={`${row.name}\n${label.toLowerCase()}: ${row[key]}`}
                        className={cn(
                          'min-w-1 rounded-[2px] first:rounded-l-sm last:rounded-r-sm',
                          swatch,
                        )}
                        style={{ flex: row[key] }}
                      />
                    ) : null,
                  )}
                </span>
                <span className="text-right text-muted-foreground">
                  {row.done} из {all(row)}
                  <span className="sr-only">
                    {' '}
                    готово, в работе {row.working}, стоит {row.stuck}, впереди {row.ahead}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {empty > 0 && shown.length > 0 && (
        <Note>
          Без задач: {empty} {plural(empty, 'проект', 'проекта', 'проектов')}.
        </Note>
      )}
    </Card>
  );
}
