import { cn } from '@/lib/utils';

/** Priority as signal bars; urgent is also colored. */
export function PriorityMark({ value, className }: { value: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn(
        'size-4 shrink-0',
        value === 4 ? 'text-danger' : 'text-muted-foreground',
        className,
      )}
    >
      {[1, 2, 3, 4].map((bar) => (
        <rect
          key={bar}
          x={bar * 3.5 - 2.25}
          y={13.5 - bar * 2.75}
          width="2.25"
          height={bar * 2.75}
          rx="0.75"
          fill="currentColor"
          opacity={bar <= value ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}
