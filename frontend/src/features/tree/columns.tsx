/** Choosing fields and their widths, for both screens. */
import { Columns3 } from 'lucide-react';
import { type RefObject, useLayoutEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  type ColumnSettings,
  columnsOf,
  DEFAULT_COLUMNS,
  isShown,
  resetColumn,
  type Screen,
  type SizedId,
  setWidth,
  showColumn,
} from '@/lib/columns';
import { cn } from '@/lib/utils';

export interface Columns {
  settings: ColumnSettings;
  change: (update: (settings: ColumnSettings) => ColumnSettings) => void;
}

/** The width of an element, known before the first paint. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidthState] = useState(0);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => setWidthState(box.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    measure();
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** How wide the name must be for every visible title to be read in full. */
export function widthOfNames(root: HTMLElement): number {
  let widest = 0;
  for (const cell of root.querySelectorAll<HTMLElement>('[data-cell="name"]')) {
    const title = cell.querySelector<HTMLElement>('[data-fit]');
    const line = title?.parentElement;
    if (!title || !line) continue;
    const gap = Number.parseFloat(getComputedStyle(line).columnGap) || 0;
    const parts = [...line.children] as HTMLElement[];
    const full = parts.reduce(
      (sum, part) => sum + (part === title ? part.scrollWidth : part.offsetWidth),
      gap * (parts.length - 1),
    );
    widest = Math.max(widest, cell.offsetWidth - line.clientWidth + full);
  }
  return Math.ceil(widest) + 2;
}

interface ResizerProps {
  id: SizedId;
  label: string;
  columns: Columns;
  /** Width on the screen when the pull begins. */
  current: () => number;
  /** What a double click does instead of returning to the usual width. */
  best?: () => number;
  /** A second handle of the same field: for the mouse only. */
  silent?: boolean;
  className?: string;
}

const STEP = 16;
const usual = (id: SizedId) => columnsOf().find((column) => column.id === id)?.width ?? 330;

export function Resizer(props: ResizerProps) {
  const { id, label, columns, current, best, silent, className } = props;
  const { settings, change } = columns;
  const set = (width: number) => change((s) => setWidth(s, id, width));
  const toBest = () => (best ? set(best()) : change((s) => resetColumn(s, id)));

  function pull(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const from = { x: event.clientX, width: current() };
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const onMove = (e: PointerEvent) => set(from.width + e.clientX - from.x);
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const run: Record<string, () => void> = {
      ArrowLeft: () => set(current() - STEP),
      ArrowRight: () => set(current() + STEP),
      Enter: toBest,
    };
    const action = run[event.key];
    if (!action || event.ctrlKey || event.altKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }

  const hint = best ? 'двойной щелчок: по содержимому' : 'двойной щелчок: как было';
  const shared = {
    title: `Потяни, чтобы изменить ширину; ${hint}`,
    onPointerDown: pull,
    onDoubleClick: toBest,
    className: cn(
      'absolute inset-y-0 -right-1.5 z-1 w-3 cursor-col-resize touch-none',
      'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 hover:after:bg-ring active:after:bg-ring',
      // The edge is seen in the header without hovering too.
      !silent && 'after:bg-border',
      className,
    ),
  };
  if (silent) return <div aria-hidden="true" data-resize={id} {...shared} />;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ширина поля «${label}»`}
      aria-valuenow={settings.width[id] ?? usual(id)}
      aria-valuetext={settings.width[id] ? `${settings.width[id]} пикселей` : 'обычная'}
      tabIndex={0}
      onKeyDown={onKeyDown}
      {...shared}
    />
  );
}

interface MenuProps {
  screen: Screen;
  columns: Columns;
  className?: string;
}

export function ColumnsMenu({ screen, columns, className }: MenuProps) {
  const { settings, change } = columns;
  const changed = Object.keys(settings.width).length + Object.keys(settings.shown).length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Поля"
          title="Поля: какие показывать"
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
            className,
          )}
        >
          <Columns3 className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-48"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
          Показывать поля
        </DropdownMenuLabel>
        {columnsOf().map(({ id, label }) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={isShown(settings, id, screen)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(on) => change((s) => showColumn(s, id, on))}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!changed} onSelect={() => change(() => DEFAULT_COLUMNS)}>
          Вернуть обычный вид
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
