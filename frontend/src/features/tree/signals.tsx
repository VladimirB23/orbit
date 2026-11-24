import type { TreeItem } from '@/lib/tree';
import { cn } from '@/lib/utils';

interface ChipsProps {
  item: TreeItem;
  /** Only numbers when the tree is narrow; the words stay in the hint and for screen readers. */
  compact?: boolean;
}

/** Trouble inside a folded row, so a fold never hides it. */
export function SignalChips({ item, compact = false }: ChipsProps) {
  const { overdue, blocked, upcoming } = item.signals;
  const chips = [
    { n: overdue, text: 'просрочено', tone: 'bg-danger-wash text-danger' },
    { n: blocked, text: 'заблокировано', tone: 'bg-blocked-wash text-blocked' },
    { n: upcoming, text: 'скоро срок', tone: 'bg-sun-wash text-sun-ink' },
  ].filter((chip) => chip.n > 0);
  if (chips.length === 0) return null;
  return (
    <span className="flex shrink-0 gap-1">
      {chips.map(({ n, text, tone }) => (
        <span
          key={text}
          title={`Внутри: ${text} ${n}`}
          className={cn('rounded-md px-1.5 text-xs leading-5', tone)}
        >
          <span className={cn(compact && 'chip-word')}>{text} </span>
          {n}
        </span>
      ))}
    </span>
  );
}

/** Second line of a folded project: where it stands and what needs attention. */
export function ProjectPulse({ item }: { item: TreeItem }) {
  const { focus, signals } = item;
  if (!focus && !signals.overdue && !signals.blocked && !signals.upcoming) return null;
  return (
    // Never wraps: a row must not change height under the cursor when the panel opens.
    <span className="pulse flex min-w-0 items-center gap-2.5 pt-0.5">
      {focus && (
        <span className="min-w-0 truncate text-muted-foreground text-sm">
          {focus.kind === 'current' ? 'Сейчас: ' : 'Дальше: '}
          <span className={cn(focus.kind === 'current' && 'text-foreground')}>{focus.title}</span>
        </span>
      )}
      <SignalChips item={item} compact />
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);
  return (
    <span className="flex h-7 items-center gap-2">
      <span
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-input/60"
      >
        <span
          className={cn('block h-full rounded-full', percent === 100 ? 'bg-done' : 'bg-sun')}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-muted-foreground text-sm">{percent}%</span>
    </span>
  );
}
