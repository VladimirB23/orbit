/** The same rows as in the tree, on a time scale. */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { Meta } from '@/api/types';
import { focusRow } from '@/features/tree/focus';
import { QuickAdd } from '@/features/tree/quick-add';
import type { RowActions } from '@/features/tree/types';
import { addingPlace, type TreeUi, useRowKeys } from '@/features/tree/use-row-keys';
import { type Day, dayDiff } from '@/lib/dates';
import { hotkey } from '@/lib/hotkeys';
import { makeScale, spanOf, ticks, ZOOMS, type Zoom } from '@/lib/timeline';
import { findItem, type Row, type TreeItem, walk } from '@/lib/tree';
import { extent } from './bar';
import { Floating, type Hover } from './floating';
import { ScaleHeader } from './scale-header';
import { TimelineRow } from './timeline-row';
import { useSchedule } from './use-schedule';
import { useViewport } from './use-viewport';

interface Props {
  items: TreeItem[];
  rows: Row[];
  today: Day;
  limits: Meta['limits'];
  ui: TreeUi;
  flashing: (row: Row) => boolean;
  actions: RowActions;
  zoom: Zoom;
  onZoom: (zoom: Zoom) => void;
  onAddClose: (parent: TreeItem, refocus: boolean) => void;
  empty: React.ReactNode;
}

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function TimelineView(props: Props) {
  const { items, rows, today, limits, ui, flashing, actions, zoom, onZoom, onAddClose } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const names = useRef<HTMLDivElement>(null);
  const view = useViewport(scroller, names);

  // All rows, also folded and filtered ones: the scale must not jump when they appear.
  const scale = useMemo(() => {
    const spans = [...walk(items)].flatMap((item) => spanOf(item, today) ?? []);
    const days = spans.flatMap((s) => (s.due ? [s.start, s.end, s.due] : [s.start, s.end]));
    return makeScale(days, today, zoom, view.width);
  }, [items, today, zoom, view.width]);

  const schedule = useSchedule({ scroller, names, scale, today, save: actions.reschedule });

  // --- place on the scale ----------------------------------------------------

  const scrollTo = (x: number, smooth = true) => {
    const behavior = smooth && !calm() ? 'smooth' : 'auto';
    // Returns nothing on purpose: in new browsers the native call gives a promise.
    void scroller.current?.scrollTo({ left: Math.max(0, x), behavior });
  };
  const toToday = (smooth = true) => scrollTo(scale.x(today) - view.width * 0.4, smooth);

  const placed = useRef<{ from: Day; px: number } | null>(null);
  /** Pixels from the left edge of the visible time that keep their date when zooming. */
  const anchor = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the scale itself changes
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box || view.width === 0) return;
    const before = placed.current;
    placed.current = { from: scale.from, px: scale.px };
    if (!before) {
      toToday(false);
      return;
    }
    if (before.from === scale.from && before.px === scale.px) return;
    const zoomed = before.px !== scale.px;
    const was = dayDiff(today, before.from) * before.px - box.scrollLeft;
    const todayInSight = was >= 0 && was <= view.width;
    if (zoomed && anchor.current === null && todayInSight) {
      toToday(false);
      return;
    }
    const at = anchor.current ?? view.width / 2;
    anchor.current = null;
    const day = (box.scrollLeft + at) / before.px + dayDiff(before.from, scale.from);
    box.scrollLeft = day * scale.px - at;
  }, [scale.from, scale.px, view.width]);

  const zoomBy = (by: number) => {
    const next = ZOOMS[ZOOMS.indexOf(zoom) + by];
    if (next) onZoom(next);
  };

  const latest = useRef({ zoomBy, toToday });
  latest.current = { zoomBy, toToday };

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let turned = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault(); // the browser would zoom the whole page
      turned += event.deltaY;
      if (Math.abs(turned) < 60) return;
      const side = names.current?.offsetWidth ?? 0;
      anchor.current = Math.max(0, event.clientX - box.getBoundingClientRect().left - side);
      latest.current.zoomBy(Math.sign(turned));
      turned = 0;
    };
    const onKey = (event: KeyboardEvent) => {
      const run: Record<string, () => void> = {
        t: () => latest.current.toToday(),
        '+': () => latest.current.zoomBy(-1),
        '-': () => latest.current.zoomBy(1),
      };
      const action = run[hotkey(event) ?? ''];
      if (!action) return;
      event.preventDefault();
      action();
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      box.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // The chosen row brings its bar into sight, also after the panel has taken its place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when another row is chosen
  useEffect(() => {
    const item = ui.selected ? findItem(items, ui.selected) : undefined;
    const span = item && spanOf(item, today);
    const box = scroller.current;
    if (!item || !span || !box || view.width === 0) return;
    const [from, to] = extent(item, span, scale, today);
    const hidden = to < box.scrollLeft + 24 || from > box.scrollLeft + view.width - 24;
    if (hidden) scrollTo(from - view.width * 0.25);
  }, [ui.selected, view.width]);

  // --- keyboard --------------------------------------------------------------

  const { root, activeKey, onKeyDown } = useRowKeys({
    rows,
    ui,
    actions,
    more: (event, item) => {
      const key = hotkey(event.nativeEvent);
      if (key === '[') return () => schedule.nudge(item, 'end', -1);
      if (key === ']') return () => schedule.nudge(item, 'end', 1);
      const shifted = event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
      if (shifted && event.key === 'ArrowLeft') return () => schedule.nudge(item, 'move', -1);
      if (shifted && event.key === 'ArrowRight') return () => schedule.nudge(item, 'move', 1);
      const cell = root.current?.querySelector<HTMLElement>(`[data-key="${item.key}"] .due-cell`);
      // No room for the date here: it is edited in the panel.
      if (key === 'd' && cell?.offsetParent === null) return () => actions.open(item);
      return undefined;
    },
  });

  // --- screen ----------------------------------------------------------------

  // Kept in its own component: a moving mouse must not redraw every row.
  const tellHover = useRef<(hover: Hover | null) => void>(() => {});
  const onHover = useCallback(
    (event: React.PointerEvent, item: TreeItem | null) =>
      tellHover.current(
        item && event.pointerType !== 'touch' ? { item, x: event.clientX, y: event.clientY } : null,
      ),
    [],
  );

  const place = addingPlace(rows, ui.adding);
  const dues = new Map(items.map((project) => [project.slug, project.dueDate]));
  const days = { '--day': `${scale.px}px`, '--step': zoom === 'days' ? 1 : 7 };

  return (
    <div className="timeline relative min-w-0 flex-1 overflow-hidden">
      <div ref={scroller} className="h-full overflow-auto">
        <div
          ref={root}
          role="treegrid"
          tabIndex={-1}
          aria-label="Проекты, этапы и задачи на шкале времени"
          aria-rowcount={rows.length + 1}
          onKeyDown={onKeyDown}
          className="timeline-body relative min-h-full outline-none"
          style={{ width: `calc(var(--names) + ${scale.width}px)` }}
        >
          <div
            aria-hidden="true"
            className={
              zoom === 'months' ? 'absolute inset-y-0' : 'timeline-grid absolute inset-y-0'
            }
            style={{ left: 'var(--names)', width: scale.width, ...days } as React.CSSProperties}
          >
            {zoom === 'months' &&
              ticks(scale, zoom).minor.map(({ day, x }) => (
                <div
                  key={day}
                  className="absolute inset-y-0 border-line border-l"
                  style={{ left: x }}
                />
              ))}
          </div>
          {/* Below the last row the stripes must not run under the names either. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="sticky left-0 h-full w-(--names) border-border border-r bg-background" />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-4 w-0.5 -translate-x-1/2 bg-foreground/40"
            style={{ left: `calc(var(--names) + ${scale.x(today) + scale.px / 2}px)` }}
          />
          <ScaleHeader
            names={names}
            scale={scale}
            zoom={zoom}
            today={today}
            onZoom={onZoom}
            onToday={toToday}
            onPan={schedule.pan}
          />
          {rows.map((row, index) => (
            <Fragment key={row.item.key}>
              <TimelineRow
                row={row}
                today={today}
                limits={limits}
                active={row.item.key === activeKey}
                selected={row.item.key === ui.selected}
                flash={flashing(row)}
                editing={ui.editing?.key === row.item.key ? ui.editing.cell : null}
                menu={ui.menu?.key === row.item.key ? ui.menu.name : null}
                actions={actions}
                scale={scale}
                view={view}
                schedule={schedule}
                projectDue={dues.get(row.item.slug) ?? null}
                onHover={onHover}
                onShow={(from) => scrollTo(from - view.width * 0.25)}
              />
              {place && ui.adding && index === place.after && (
                <div className="sticky left-0 z-11 w-[min(40rem,100cqw)] bg-background">
                  <QuickAdd
                    key={`${ui.adding.parent}-${ui.adding.kind}`}
                    parent={place.parent.item}
                    kind={ui.adding.kind}
                    depth={place.parent.depth + 1}
                    limit={ui.adding.kind === 'milestone' ? limits.name : limits.title}
                    onClose={(refocus) => {
                      onAddClose(place.parent.item, refocus);
                      if (refocus) requestAnimationFrame(() => focusRow(place.parent.item.key));
                    }}
                  />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
      {rows.length === 0 && <div className="absolute inset-x-0 top-12">{props.empty}</div>}
      <Floating tell={tellHover} move={schedule.move} selected={ui.selected} today={today} />
    </div>
  );
}
