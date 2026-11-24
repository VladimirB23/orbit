/** One strip above everything it scopes: period and project. Both live in the address bar. */
import { CalendarRange, ChevronDown, X } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { ru } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DEFAULT_PERIOD,
  PERIOD_LABEL,
  PERIODS,
  type Period,
  type PeriodKey,
  type PeriodSearch,
  periodText,
} from '@/lib/analytics';
import { type Day, toDate, toDay } from '@/lib/dates';
import { cn } from '@/lib/utils';

export type FilterPatch = PeriodSearch & { project?: string };

interface Props {
  period: Period;
  /** What the server has counted; "all time" begins where it says. */
  counted: { start: Day; end: Day } | undefined;
  project: string | undefined;
  projects: { slug: string; title: string }[];
  today: Day;
  onChange: (patch: FilterPatch) => void;
}

const chip =
  'flex h-8 items-center gap-1.5 whitespace-nowrap border-border border-r px-3 text-sm last:border-r-0 hover:text-foreground max-sm:px-2.5';

export function Filters({ period, counted, project, projects, today, onChange }: Props) {
  const choose = (key: PeriodKey) =>
    onChange({ period: key === DEFAULT_PERIOD ? undefined : key, from: undefined, to: undefined });
  const changed = period.key !== DEFAULT_PERIOD || project !== undefined;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-border border-b px-4 py-2.5">
      <fieldset className="flex overflow-hidden rounded-lg border border-border bg-card">
        <legend className="sr-only">Период</legend>
        {PERIODS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={period.key === key}
            onClick={() => choose(key)}
            className={cn(
              chip,
              'text-muted-foreground',
              period.key === key && 'bg-selected font-medium text-foreground',
            )}
          >
            {PERIOD_LABEL[key]}
          </button>
        ))}
        <OwnPeriod
          period={period}
          today={today}
          onChange={(from, to) => onChange({ period: undefined, from, to })}
        />
      </fieldset>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 max-w-64 bg-card font-normal">
            <span className="sr-only">Проект: </span>
            <span className="truncate">
              {projects.find((p) => p.slug === project)?.title ?? 'Все проекты'}
            </span>
            <ChevronDown className="text-faint" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 max-w-72 overflow-y-auto">
          <DropdownMenuRadioGroup
            value={project ?? ''}
            onValueChange={(slug) => onChange({ project: slug || undefined })}
          >
            <DropdownMenuRadioItem value="">Все проекты</DropdownMenuRadioItem>
            {projects.map(({ slug, title }) => (
              <DropdownMenuRadioItem key={slug} value={slug}>
                <span className="truncate">{title}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {changed && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 font-normal text-muted-foreground"
          onClick={() =>
            onChange({ period: undefined, from: undefined, to: undefined, project: undefined })
          }
        >
          <X /> Сбросить
        </Button>
      )}
      {counted && (
        <p className="ml-auto text-muted-foreground text-sm">
          {periodText(counted.start, counted.end)}
        </p>
      )}
    </div>
  );
}

interface OwnProps {
  period: Period;
  today: Day;
  onChange: (from: Day, to: Day) => void;
}

function OwnPeriod({ period, today, onChange }: OwnProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const own = period.key === 'own' && period.start !== null;

  const start = (next: boolean) => {
    setOpen(next);
    // Every time from a clean sheet: the first click is the beginning.
    if (next) setRange(undefined);
  };
  const pick = (next: DateRange | undefined, day: Date) => {
    if (!range?.from) return setRange({ from: day, to: undefined });
    const [from, to] = range.from <= day ? [range.from, day] : [day, range.from];
    setRange(next);
    setOpen(false);
    onChange(toDay(from), toDay(to));
  };

  return (
    <Popover open={open} onOpenChange={start}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-pressed={own}
          className={cn(
            chip,
            'text-muted-foreground',
            own && 'bg-selected font-medium text-foreground',
          )}
        >
          <CalendarRange aria-hidden="true" className="size-4" />
          <span className="max-sm:sr-only">Свои даты</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2"
        aria-label="Свои даты"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <p className="px-2 pt-1 text-muted-foreground text-sm">
          {range?.from ? 'Теперь последний день' : 'Выбери первый день'}
        </p>
        <Calendar
          mode="range"
          locale={ru}
          selected={
            range ??
            (own && period.start
              ? { from: toDate(period.start), to: toDate(period.end) }
              : undefined)
          }
          defaultMonth={toDate(own ? period.end : today)}
          today={toDate(today)}
          disabled={{ after: toDate(today) }}
          onSelect={pick}
          className="p-1 [--cell-size:--spacing(9)]"
        />
      </PopoverContent>
    </Popover>
  );
}
