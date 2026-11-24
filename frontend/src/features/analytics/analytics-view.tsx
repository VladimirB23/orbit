/** The third look at the same projects: where attention goes and how work moves. */
import { useMemo } from 'react';
import { useAnalytics } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { lead, resolvePeriod } from '@/lib/analytics';
import type { Day } from '@/lib/dates';
import type { TreeSearch } from '@/lib/search';
import { cn } from '@/lib/utils';
import { ActivityChart } from './activity-chart';
import { DeadlinesChart } from './deadlines-chart';
import { type FilterPatch, Filters } from './filters';
import { FocusChart } from './focus-chart';
import { ClosedChart, CycleChart, PlanChart, StatusesChart } from './pace-charts';
import { Tiles } from './tiles';
import { TipArea } from './tip';

interface Props {
  search: TreeSearch;
  today: Day;
  projects: { slug: string; title: string }[];
  onSearch: (patch: FilterPatch) => void;
  onOpen: (key: string) => void;
}

export function AnalyticsView({ search, today, projects, onSearch, onOpen }: Props) {
  const period = resolvePeriod(search, today);
  const { data, isError, isPlaceholderData, refetch } = useAnalytics({
    start: period.start ?? undefined,
    end: period.end,
    project: search.project,
  });
  // Archived projects are not in the tree, but their work is in the numbers.
  const names = useMemo(
    () =>
      new Map([
        ...(data?.focus ?? []).map((row): [string, string] => [row.slug, row.name]),
        ...projects.map((p): [string, string] => [p.slug, p.title]),
      ]),
    [projects, data],
  );

  return (
    <>
      <Filters
        period={period}
        counted={data && { start: data.start, end: data.end }}
        project={search.project}
        projects={projects}
        today={today}
        onChange={onSearch}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TipArea
          className={cn(
            '@container/page mx-auto max-w-[100rem] px-4 pt-4 pb-10 transition-opacity',
            isPlaceholderData && 'opacity-60',
          )}
        >
          {data ? (
            <>
              <h2 className="sr-only">Аналитика</h2>
              <Tiles data={data} />
              <p className="mt-5 max-w-5xl text-balance text-lg leading-snug">
                {lead(data, search.project !== undefined).map((part, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one sentence, in order
                    key={i}
                    className={cn(
                      part.tone && 'font-semibold',
                      part.tone === 'low' && 'text-sun-ink',
                    )}
                  >
                    {part.text}
                  </span>
                ))}
              </p>
              <Band title="Каждый день">
                <Column className="@3xl/page:col-span-12 @4xl/page:col-span-7">
                  <FocusChart rows={data.focus} today={data.today} onOpen={onOpen} />
                  <ActivityChart data={data} />
                </Column>
                <Column className="@3xl/page:col-span-12 @4xl/page:col-span-5">
                  <DeadlinesChart data={data} names={names} onOpen={onOpen} />
                  <StatusesChart rows={data.focus} />
                </Column>
              </Band>
              <Band title="Раз в неделю" note="как идет работа, а не что горит">
                <ClosedChart className="@3xl/page:col-span-6 @6xl/page:col-span-4" data={data} />
                <CycleChart className="@3xl/page:col-span-6 @6xl/page:col-span-4" data={data} />
                <PlanChart
                  className="@3xl/page:col-span-12 @6xl/page:col-span-4"
                  data={data}
                  names={names}
                  onOpen={onOpen}
                />
              </Band>
            </>
          ) : isError ? (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-20 text-center text-muted-foreground">
              <h2 className="font-semibold text-foreground">Не получилось посчитать</h2>
              <p>
                Сервер не ответил или такого проекта нет. Попробуй еще раз или сбрось фильтры
                сверху.
              </p>
              <Button onClick={() => void refetch()}>Посчитать еще раз</Button>
            </div>
          ) : (
            <Waiting />
          )}
        </TipArea>
      </div>
    </>
  );
}

function Band({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <p aria-hidden="true" className="mt-6 mb-2.5 flex items-baseline gap-2.5 font-semibold">
        {title}
        {note && <span className="font-normal text-muted-foreground text-sm">{note}</span>}
      </p>
      <div className="grid gap-3 @3xl/page:grid-cols-12">{children}</div>
    </section>
  );
}

/** Cards one under another; the last one reaches down to the neighbor column. */
function Column({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3 *:last:flex-1', className)}>{children}</div>
  );
}

function Waiting() {
  return (
    <div role="status" className="grid grid-cols-2 gap-3 @5xl/page:grid-cols-5">
      <span className="sr-only">Считаю</span>
      {['a', 'b', 'c', 'd', 'e'].map((id) => (
        <div key={id} className="h-28 animate-pulse rounded-xl bg-raised/70" />
      ))}
    </div>
  );
}
