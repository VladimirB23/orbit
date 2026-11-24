/** Frame of a chart: what it shows, the chart, how it is counted. */
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  title: React.ReactNode;
  sub: string;
  how: React.ReactNode;
  tools?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Card({ title, sub, how, tools, className, children }: CardProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        '@container flex min-w-0 flex-col rounded-xl border border-border bg-card px-4 pt-3.5 pb-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={id} className="text-balance font-semibold text-base leading-snug">
            {title}
          </h3>
          <p className="text-muted-foreground text-sm">{sub}</p>
        </div>
        {tools}
      </div>
      <div className="mt-3 min-w-0 flex-1">{children}</div>
      <details className="mt-3 border-line border-t pt-2 text-muted-foreground text-sm">
        <summary className="w-fit cursor-pointer rounded-sm hover:text-foreground">
          Как посчитано
        </summary>
        <div className="mt-1.5 max-w-prose space-y-1.5">{how}</div>
      </details>
    </section>
  );
}

interface NeedProps {
  have: number;
  of: number;
  children: React.ReactNode;
}

/** Instead of a pattern out of noise: how much there is and how much it takes. */
export function Need({ have, of, children }: NeedProps) {
  return (
    <div className="rounded-lg bg-raised px-3.5 py-2.5 text-sm">
      {children}
      <span aria-hidden="true" className="mt-2 flex gap-1">
        {Array.from({ length: of }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the marks are all alike
            key={i}
            className={cn(
              'h-1.5 max-w-8 flex-1 rounded-full',
              i < have ? 'bg-chart-bar' : 'bg-input/60',
            )}
          />
        ))}
      </span>
    </div>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-muted-foreground text-sm">{children}</p>;
}

export function Legend({ items }: { items: [swatch: string, text: string][] }) {
  return (
    <ul className="mb-2.5 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-sm">
      {items.map(([swatch, text]) => (
        <li key={text} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={cn('size-2.5 rounded-[2px]', swatch)} />
          {text}
        </li>
      ))}
    </ul>
  );
}
