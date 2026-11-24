/** Columns over time or over bins. A list for screen readers, columns for eyes. */
import { niceTop } from '@/lib/analytics';
import { cn } from '@/lib/utils';

export interface Column {
  key: string;
  /** Under the column; empty when labels would collide. */
  label: string;
  /** Full words: the hint and the text for screen readers. */
  title: string;
  value: number;
  /** A second, hatched part on top. */
  extra?: number;
  pale?: boolean;
  /** The number above the column. */
  shown: boolean;
}

export function Columns({ columns, axis = true }: { columns: Column[]; axis?: boolean }) {
  const top = niceTop(Math.max(...columns.map((c) => c.value + (c.extra ?? 0))));
  const lines = [1, 0.75, 0.5, 0.25];
  return (
    <div className="flex gap-2">
      {axis && (
        <span aria-hidden="true" className="relative w-5 shrink-0 text-faint text-xs">
          {lines.map((part) => (
            <span
              key={part}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(1 - part) * 8 + 1.1}rem` }}
            >
              {top * part}
            </span>
          ))}
        </span>
      )}
      <div className="relative min-w-0 flex-1 pt-[1.1rem]">
        {axis && (
          <span aria-hidden="true" className="absolute inset-x-0 top-[1.1rem] h-32">
            {lines.map((part) => (
              <span
                key={part}
                className="absolute inset-x-0 h-px bg-line"
                style={{ top: `${(1 - part) * 100}%` }}
              />
            ))}
          </span>
        )}
        <ol className="relative flex h-32 items-end gap-0.5 border-input border-b">
          {columns.map((column) => {
            const total = column.value + (column.extra ?? 0);
            return (
              <li
                key={column.key}
                data-tip={column.title}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <span className="sr-only">{column.title}</span>
                <span
                  aria-hidden="true"
                  className="-mb-px text-muted-foreground text-xs leading-none"
                >
                  <span className="block pb-1">{column.shown ? total : ''}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex w-3/4 max-w-6 flex-col gap-0.5 group-hover:brightness-110',
                    column.pale && 'opacity-60',
                  )}
                  style={{ height: `${(total / top) * 100}%` }}
                >
                  {column.extra ? (
                    <span
                      className="born-closed min-h-1 rounded-t-sm"
                      style={{ flex: column.extra }}
                    />
                  ) : null}
                  {column.value ? (
                    <span
                      className={cn('bg-chart-done', !column.extra && 'rounded-t-sm')}
                      style={{ flex: column.value }}
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
        <div aria-hidden="true" className="mt-1 flex gap-0.5 text-muted-foreground text-xs">
          {columns.map((column) => (
            <span key={column.key} className="flex min-w-0 flex-1 justify-center">
              <span className="whitespace-nowrap">{column.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
