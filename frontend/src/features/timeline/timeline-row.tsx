import { ArrowLeft, ArrowRight, CircleDashed } from 'lucide-react';
import { useState } from 'react';
import type { Meta } from '@/api/types';
import { DateField } from '@/components/fields/date-field';
import { StatusMenu } from '@/components/fields/status-menu';
import { focusRow } from '@/features/tree/focus';
import { ActionsMenu, cellButton, DateText, dueTone, TitleCell } from '@/features/tree/row-parts';
import type { CellMenu, RowActions, TextCell } from '@/features/tree/types';
import { type Day, dueHint, formatDay } from '@/lib/dates';
import { isClosed, STATUS_LABEL } from '@/lib/status';
import { grips, laneItems, pack, type Scale, spanOf, withDates } from '@/lib/timeline';
import type { Row, TreeItem } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { Bar, extent, LANE_STEP, ProjectRail, reach } from './bar';
import type { Schedule } from './use-schedule';
import { useOutOfSight, type Viewport } from './use-viewport';

interface Props {
  row: Row;
  today: Day;
  limits: Meta['limits'];
  active: boolean;
  selected: boolean;
  flash: boolean;
  editing: TextCell | null;
  menu: CellMenu | null;
  actions: RowActions;
  scale: Scale;
  view: Viewport;
  schedule: Schedule;
  /** Deadline of the project the row belongs to, for the rows inside it. */
  projectDue: Day | null;
  onHover: (event: React.PointerEvent, item: TreeItem | null) => void;
  onShow: (from: number) => void;
}

const MIN_HEIGHT = { project: 44, milestone: 38, task: 34 } as const;

export function TimelineRow(props: Props) {
  const { row, today, limits, active, selected, flash, editing, menu, actions } = props;
  const { item } = row;
  const tab = active ? 0 : -1;
  const closed = isClosed(item.status);
  const menuProps = (name: CellMenu) => ({
    open: menu === name,
    onOpenChange: (open: boolean) => actions.setMenu(item, open ? name : null),
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      focusRow(item.key);
    },
  });

  return (
    <div
      role="row"
      tabIndex={tab}
      data-key={item.key}
      aria-level={row.depth + 1}
      aria-posinset={row.position}
      aria-setsize={row.siblings}
      aria-expanded={row.hasChildren ? row.open : undefined}
      aria-selected={selected}
      onFocus={(event) => event.target === event.currentTarget && actions.activate(item.key)}
      onMouseDown={() => actions.activate(item.key)}
      className={cn(
        'group/row relative flex scroll-mt-12 border-line border-b outline-none',
        item.entity === 'project' && 'border-t border-t-border',
        (editing || menu) && 'z-12',
      )}
    >
      <div
        className={cn(
          'timeline-names sticky left-0 z-10 border-border border-r bg-background pl-2',
          'group-hover/row:bg-raised group-focus-visible/row:outline-2 group-focus-visible/row:outline-ring group-focus-visible/row:outline-offset-[-2px]',
          selected && 'bg-selected group-hover/row:bg-selected',
          flash && 'animate-flash',
        )}
      >
        <TitleCell
          row={row}
          limits={limits}
          tab={tab}
          editing={editing}
          actions={actions}
          overlay={
            <>
              <StatusMenu
                value={item.status}
                onChange={(status) => void actions.save(item, { status })}
                {...menuProps('status')}
              >
                <button
                  type="button"
                  tabIndex={tab}
                  aria-label={`Статус: ${STATUS_LABEL[item.status]}`}
                  title={`Статус: ${STATUS_LABEL[item.status]}`}
                  className="grid size-7 place-items-center rounded-md text-faint opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
                >
                  <CircleDashed className="size-4" />
                </button>
              </StatusMenu>
              <ActionsMenu item={item} tab={tab} menu={menu} actions={actions} />
            </>
          }
        />
        <div role="gridcell" className="due-cell">
          <DateField
            label="Срок"
            value={item.dueDate}
            today={today}
            onChange={(day) => void actions.save(item, { due_date: day })}
            {...menuProps('due')}
          >
            <button
              type="button"
              tabIndex={tab}
              title={item.dueDate && !closed ? dueHint(item.dueDate, today) : undefined}
              className={cn(cellButton, 'text-sm')}
            >
              <DateText day={item.dueDate} today={today} empty="срок" tone={dueTone(item)} />
            </button>
          </DateField>
        </div>
      </div>
      <Track {...props} tab={tab} />
    </div>
  );
}

function Track(props: Props & { tab: number }) {
  const { row, today, actions, scale, view, schedule, projectDue, onHover, onShow, tab } = props;
  const { selected, flash } = props;
  const { item } = row;
  const [hoverDay, setHoverDay] = useState<Day | null>(null);

  const shown = withDates(item, schedule.changesOf(item.key));
  const span = spanOf(shown, today);
  const lane = row.open ? [] : laneItems(item, today);

  // Lanes stay put while something is dragged: they are chosen by the saved dates.
  const inside = lane.flatMap((child) => {
    const saved = spanOf(child, today);
    const now = withDates(child, schedule.changesOf(child.key));
    const current = spanOf(now, today);
    return saved && current
      ? [{ child: now, span: current, at: extent(child, saved, scale, today, true) }]
      : [];
  });
  const order = [...inside].sort((a, b) => a.at[0] - b.at[0]);
  const lanes = pack(
    order.map(({ at }) => at),
    6,
  );
  const laneCount = Math.max(0, ...lanes) + (lanes.length > 0 ? 1 : 0);
  const rail = laneCount > 0 && span?.due ? span : null;
  const height =
    laneCount > 0 ? Math.max(50, laneCount * LANE_STEP + (rail ? 24 : 9)) : MIN_HEIGHT[item.entity];

  const marks = inside.map(({ child, span: s }) => reach(child, s, scale, today));
  if (span) marks.push(reach(shown, span, scale, today));
  const drawable = laneCount === 0 && grips(shown, span).includes('draw');
  const drawing = schedule.move?.item.key === item.key && schedule.move.grip === 'draw';

  const xOf = (event: React.PointerEvent) =>
    event.clientX - event.currentTarget.getBoundingClientRect().left;
  const onTrack = (event: React.PointerEvent) => event.target === event.currentTarget;
  const isMoving = (target: TreeItem) =>
    schedule.move?.item.key === target.key && schedule.move.at !== null;

  return (
    <div
      role="gridcell"
      className={cn(
        'relative flex flex-none items-center',
        'group-hover/row:bg-raised/45',
        selected && 'bg-selected/50 group-hover/row:bg-selected/50',
        flash && 'animate-flash',
        drawable ? 'cursor-crosshair' : 'cursor-default',
      )}
      style={{ width: scale.width, minHeight: height }}
      onPointerDown={(event) => {
        if (!onTrack(event)) return;
        if (drawable) schedule.draw(event, item, xOf(event));
        else schedule.pan(event);
      }}
      onPointerMove={(event) => {
        if (!drawable || event.pointerType === 'touch') return;
        setHoverDay(onTrack(event) ? scale.day(xOf(event)) : null);
      }}
      onPointerLeave={() => setHoverDay(null)}
    >
      {projectDue && item.entity !== 'project' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-0 border-foreground/35 border-l border-dashed"
          style={{ left: scale.x(projectDue) + scale.px }}
        />
      )}
      {drawable && hoverDay && !drawing && !schedule.move && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute flex h-5.5 items-center gap-2 whitespace-nowrap text-faint text-xs"
          style={{ left: scale.x(hoverDay) }}
        >
          <span
            className="h-full rounded-md border border-input border-dashed bg-background"
            style={{ width: Math.max(scale.px, 10) }}
          />
          {formatDay(hoverDay, today)}: проведи, чтобы задать срок
        </div>
      )}
      {rail && <ProjectRail span={rail} scale={scale} today={today} bottom={9} />}
      {order.map(({ child, span: childSpan }, index) => (
        <Bar
          key={child.key}
          item={child}
          span={childSpan}
          scale={scale}
          today={today}
          top={(lanes[index] ?? 0) * LANE_STEP + 5}
          tab={tab}
          moving={isMoving(child)}
          schedule={schedule}
          onOpen={actions.open}
          onHover={onHover}
        />
      ))}
      {laneCount === 0 && span && (
        <Bar
          item={shown}
          span={span}
          scale={scale}
          today={today}
          tab={tab}
          moving={isMoving(item) || drawing}
          schedule={schedule}
          onOpen={actions.open}
          onHover={onHover}
        />
      )}
      {marks.length > 0 && (
        <OutOfSight
          view={view}
          from={Math.min(...marks.map(([from]) => from))}
          to={Math.max(...marks.map(([, to]) => to))}
          title={item.title}
          tab={tab}
          onShow={onShow}
        />
      )}
    </div>
  );
}

interface OutOfSightProps {
  view: Viewport;
  from: number;
  to: number;
  title: string;
  tab: number;
  onShow: (from: number) => void;
}

/** A row whose bar has gone out of sight says where it is. */
function OutOfSight({ view, from, to, title, tab, onShow }: OutOfSightProps) {
  const side = useOutOfSight(view, from, to);
  if (!side) return null;
  const Icon = side === 'left' ? ArrowLeft : ArrowRight;
  return (
    <button
      type="button"
      tabIndex={tab}
      aria-label={`Показать на шкале: ${title}`}
      title="Показать на шкале"
      onClick={() => onShow(from)}
      className={cn(
        'sticky z-4 grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground',
        side === 'left' ? 'left-[calc(var(--names)+0.4rem)]' : 'right-1.5 ml-auto',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}
