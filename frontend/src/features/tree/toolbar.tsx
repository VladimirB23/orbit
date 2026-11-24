/** Summary counters that filter the tree, plus search and the rest of the filters. */
import { ListFilter, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Status } from '@/api/types';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STATUS_LABEL, STATUSES, VIEW_LABEL } from '@/lib/status';
import { type Filter, VIEWS, type View } from '@/lib/tree';
import { cn } from '@/lib/utils';

const VIEW_STYLE: Record<View, { dot: string; on: string }> = {
  in_progress: {
    dot: 'bg-sun',
    on: 'border-sun bg-sun-wash text-sun-ink',
  },
  blocked: {
    dot: 'bg-blocked',
    on: 'border-blocked bg-blocked-wash text-blocked',
  },
  overdue: {
    dot: 'bg-danger',
    on: 'border-danger bg-danger-wash text-danger',
  },
  upcoming: {
    dot: 'bg-planned',
    on: 'border-planned bg-selected text-planned',
  },
};

interface SummaryProps {
  filter: Filter;
  counts: Record<View, number>;
  onFilter: (patch: Partial<Filter>) => void;
}

interface FilterProps {
  filter: Filter;
  archived: boolean;
  projects: { slug: string; title: string }[];
  onFilter: (patch: Partial<Filter>) => void;
  onArchived: (archived: boolean) => void;
  onReset: () => void;
}

export function SummaryBar({ filter, counts, onFilter }: SummaryProps) {
  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-1.5">
      <legend className="sr-only">Сводка: нажми, чтобы показать только это</legend>
      {VIEWS.map((view) => {
        const on = filter.view === view;
        const { dot, on: onStyle } = VIEW_STYLE[view];
        const count = counts[view];
        return (
          <button
            key={view}
            type="button"
            aria-pressed={on}
            disabled={count === 0 && !on}
            onClick={() => onFilter({ view: on ? null : view })}
            className={cn(
              'flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm transition-colors',
              'enabled:hover:border-input disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:text-faint',
              on && onStyle,
            )}
          >
            <span className={cn('size-1.5 rounded-full', dot, count === 0 && 'opacity-40')} />
            {VIEW_LABEL[view]}
            <span className="font-semibold">{count}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

/** Typing is instant on screen; the filter follows a moment later. */
export function SearchField({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value);
  const sent = useRef(value);

  // Changed from outside: the back button or the reset button.
  useEffect(() => {
    if (value !== sent.current) {
      sent.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = text;
      onChange(text);
    }, 120);
    return () => clearTimeout(timer);
  }, [text, onChange]);

  return (
    <label className="relative flex min-w-32 max-w-sm flex-1 items-center">
      <Search className="pointer-events-none absolute left-2.5 size-4 text-faint" />
      <span className="sr-only">Поиск</span>
      <input
        id="search"
        type="search"
        value={text}
        placeholder="Поиск"
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          setText('');
          event.currentTarget.blur();
        }}
        className="h-8 w-full rounded-lg border border-border bg-card pr-8 pl-8 text-sm outline-none placeholder:text-faint focus:border-ring focus:ring-1 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 rounded border border-border px-1.5 font-sans text-faint text-xs"
      >
        /
      </span>
    </label>
  );
}

export function FilterMenu(props: FilterProps) {
  const { filter, archived, projects, onFilter, onArchived, onReset } = props;
  const active =
    filter.statuses.length +
    (filter.project ? 1 : 0) +
    (filter.hideClosed ? 1 : 0) +
    (archived ? 1 : 0);
  const any = active > 0 || filter.q !== '' || filter.view !== null;
  const keepOpen = (event: Event) => event.preventDefault();

  const toggleStatus = (status: Status, on: boolean) =>
    onFilter({
      statuses: on
        ? STATUSES.filter((s) => s === status || filter.statuses.includes(s))
        : filter.statuses.filter((s) => s !== status),
    });

  return (
    <div className="flex items-center gap-1">
      {any && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 font-normal text-muted-foreground"
          onClick={onReset}
        >
          <X /> Сбросить
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 bg-card font-normal">
            <ListFilter />
            Фильтр
            {active > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-primary-foreground text-xs leading-4">
                {active}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuCheckboxItem
            checked={filter.hideClosed}
            onSelect={keepOpen}
            onCheckedChange={(hideClosed) => onFilter({ hideClosed })}
          >
            Скрыть закрытые
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={archived}
            onSelect={keepOpen}
            onCheckedChange={onArchived}
          >
            Показать архив
          </DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger inset>
              <span className="max-w-48 truncate">
                {projects.find((p) => p.slug === filter.project)?.title ?? 'Все проекты'}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-96 max-w-72 overflow-y-auto">
              <DropdownMenuRadioGroup
                value={filter.project ?? ''}
                onValueChange={(slug) => onFilter({ project: slug || null })}
              >
                <DropdownMenuRadioItem value="">Все проекты</DropdownMenuRadioItem>
                {projects.map((project) => (
                  <DropdownMenuRadioItem key={project.slug} value={project.slug}>
                    <span className="truncate">{project.title}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
            Только статусы
          </DropdownMenuLabel>
          {STATUSES.map((status) => (
            <DropdownMenuCheckboxItem
              key={status}
              checked={filter.statuses.includes(status)}
              onSelect={keepOpen}
              onCheckedChange={(on) => toggleStatus(status, on)}
            >
              <OrbitGlyph status={status} />
              {STATUS_LABEL[status]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
