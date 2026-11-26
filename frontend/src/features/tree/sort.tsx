/** The order of rows: a click on a field in the tree, a menu for both screens. */
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  describeSort,
  isSortKey,
  nextSort,
  SORT_FIELDS,
  SORT_KEYS,
  type Sort,
  type SortKey,
} from '@/lib/sort';
import { cn } from '@/lib/utils';

export interface Sorting {
  sort: Sort | null;
  onSort: (sort: Sort | null) => void;
}

const Arrow = ({ desc, className }: { desc: boolean; className?: string }) =>
  desc ? <ArrowDown className={className} /> : <ArrowUp className={className} />;

interface HeaderProps extends Sorting {
  field: SortKey;
  label: string;
  textClass?: string;
}

/** The name of a field that orders rows by it: useful order, reverse, usual. */
export function SortHeader({ field, label, textClass, sort, onSort }: HeaderProps) {
  const on = sort?.key === field ? sort : null;
  const next = nextSort(sort, field);
  return (
    <button
      type="button"
      onClick={() => onSort(next)}
      title={next ? `Сортировать: ${describeSort(next)}` : 'Вернуть обычный порядок'}
      className={cn(
        'group/sort -ml-1 flex h-6 min-w-0 items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground',
        on && 'font-medium text-foreground',
      )}
    >
      <span className={cn('truncate', textClass)}>{label}</span>
      <Arrow
        desc={on ? on.desc : SORT_FIELDS[field].desc}
        className={cn(
          'size-3 shrink-0',
          !on && 'opacity-0 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60',
        )}
      />
    </button>
  );
}

export const ariaSort = (sort: Sort | null, field: SortKey) =>
  sort?.key === field ? (sort.desc ? 'descending' : 'ascending') : undefined;

const NONE = 'none';

/** For the timeline and narrow screens, where fields have no headers. */
export function SortMenu({ sort, onSort }: Sorting) {
  const keepOpen = (event: Event) => event.preventDefault();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title={sort ? `Порядок: ${describeSort(sort)}` : 'Порядок строк'}
          className={cn('h-8 bg-card font-normal', sort && 'border-ring')}
        >
          {sort ? <Arrow desc={sort.desc} /> : <ArrowUpDown />}
          {sort ? SORT_FIELDS[sort.key].label : 'Порядок'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
          Сортировать по полю
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort?.key ?? NONE}
          onValueChange={(key) => {
            if (!isSortKey(key)) return onSort(null);
            if (sort?.key !== key) onSort(nextSort(null, key));
          }}
        >
          <DropdownMenuRadioItem value={NONE} onSelect={keepOpen}>
            Обычный порядок
          </DropdownMenuRadioItem>
          {SORT_KEYS.map((key) => (
            <DropdownMenuRadioItem key={key} value={key} onSelect={keepOpen}>
              {SORT_FIELDS[key].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {sort && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sort.desc ? 'desc' : 'asc'}
              onValueChange={(way) => onSort({ key: sort.key, desc: way === 'desc' })}
            >
              {(['asc', 'desc'] as const).map((way) => (
                <DropdownMenuRadioItem key={way} value={way} onSelect={keepOpen}>
                  {SORT_FIELDS[sort.key].ways[way === 'desc' ? 1 : 0]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
