/** One field of a row. The same cells serve the tree and the timeline. */
import { Folder } from 'lucide-react';
import type { Meta } from '@/api/types';
import { DateField } from '@/components/fields/date-field';
import { PriorityMenu, StatusMenu } from '@/components/fields/status-menu';
import { TextEditor } from '@/components/fields/text-editor';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { PriorityMark } from '@/components/priority-mark';
import { usePlaces } from '@/features/item/places';
import { noteField } from '@/features/item/use-edit';
import type { ColumnId } from '@/lib/columns';
import { type Day, dueHint, relativeTime } from '@/lib/dates';
import { isClosed, PRIORITY_LABEL, STATUS_LABEL } from '@/lib/status';
import type { TreeItem } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { cellButton, DateText, dueTone, Empty } from './row-parts';
import { ProgressBar } from './signals';
import type { CellMenu, RowActions, TextCell } from './types';

export interface MenuState {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
}

export interface CellProps {
  item: TreeItem;
  today: Day;
  limits: Meta['limits'];
  tab: number;
  editing: TextCell | null;
  menuProps: (name: CellMenu) => MenuState;
  actions: RowActions;
  /** The second line of a project's comment: its folder. */
  folder?: boolean;
}

export function Cell({ id, ...props }: CellProps & { id: ColumnId }) {
  return (
    <div
      role="gridcell"
      data-cell={id}
      className={cn('relative min-w-0', id === 'note' && 'col-note')}
    >
      <Content id={id} {...props} />
    </div>
  );
}

function Content({ id, ...props }: CellProps & { id: ColumnId }) {
  const { item, today } = props;
  switch (id) {
    case 'status':
      return <StatusCell {...props} />;
    case 'priority':
      return <PriorityCell {...props} />;
    case 'progress':
      return item.progress === null ? null : (
        <div className="pl-1.5">
          <ProgressBar value={item.progress} label={`Прогресс: ${item.title}`} />
        </div>
      );
    case 'start':
      return <StartCell {...props} />;
    case 'due':
      return <DueCell {...props} />;
    case 'began':
      return <PlainDate day={item.actualStart} today={today} />;
    case 'ended':
      return <PlainDate day={item.actualEnd} today={today} />;
    case 'updated':
      return (
        <span className="block truncate px-1.5 text-muted-foreground text-sm">
          {relativeTime(item.updatedAt)}
        </span>
      );
    case 'note':
      return <NoteCell {...props} />;
  }
}

function StatusCell({ item, tab, actions, menuProps }: CellProps) {
  return (
    <StatusMenu
      value={item.status}
      onChange={(status) => void actions.save(item, { status })}
      {...menuProps('status')}
    >
      <button
        type="button"
        tabIndex={tab}
        aria-label={`Статус: ${STATUS_LABEL[item.status]}`}
        className={cn(cellButton, isClosed(item.status) && 'text-muted-foreground')}
      >
        <OrbitGlyph status={item.status} className="col-status-glyph size-3.5" />
        <span className="col-status-text truncate text-sm">{STATUS_LABEL[item.status]}</span>
      </button>
    </StatusMenu>
  );
}

function PriorityCell({ item, tab, actions, menuProps }: CellProps) {
  if (item.priority === null) return null;
  const label = PRIORITY_LABEL[item.priority];
  return (
    <PriorityMenu
      value={item.priority}
      onChange={(priority) => void actions.save(item, { priority })}
      {...menuProps('priority')}
    >
      <button
        type="button"
        tabIndex={tab}
        aria-label={`Приоритет: ${label}`}
        className={cn(cellButton, 'text-muted-foreground text-sm')}
      >
        {item.priority > 0 ? (
          <>
            <PriorityMark value={item.priority} />
            <span className="truncate">{label}</span>
          </>
        ) : (
          <Empty>приоритет</Empty>
        )}
      </button>
    </PriorityMenu>
  );
}

function StartCell({ item, today, tab, actions, menuProps }: CellProps) {
  return (
    <DateField
      label="Дата старта"
      value={item.startDate}
      today={today}
      onChange={(day) => void actions.save(item, { start_date: day })}
      {...menuProps('start')}
    >
      <button type="button" tabIndex={tab} className={cn(cellButton, 'text-sm')}>
        <DateText day={item.startDate} today={today} empty="старт" tone="text-muted-foreground" />
      </button>
    </DateField>
  );
}

function DueCell({ item, today, tab, actions, menuProps }: CellProps) {
  return (
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
        title={item.dueDate && !isClosed(item.status) ? dueHint(item.dueDate, today) : undefined}
        className={cn(cellButton, 'text-sm')}
      >
        <DateText day={item.dueDate} today={today} empty="срок" tone={dueTone(item)} />
        {item.overdue && <span className="sr-only">просрочено</span>}
      </button>
    </DateField>
  );
}

function PlainDate({ day, today }: { day: Day | null; today: Day }) {
  return (
    <span className="block truncate px-1.5 text-sm">
      {day && <DateText day={day} today={today} empty="" tone="text-muted-foreground" />}
    </span>
  );
}

function NoteCell({ item, limits, tab, editing, actions, folder }: CellProps) {
  const task = item.entity === 'task';
  return (
    <>
      {editing === 'note' ? (
        <div className="absolute inset-x-0 top-1/2 z-30 -translate-y-[0.95rem]">
          <TextEditor
            label={task ? 'Комментарий' : 'Кратко'}
            initial={item.note ?? ''}
            limit={task ? limits.comment : limits.summary}
            multiline
            className="text-sm"
            onSave={(text) => actions.save(item, { [noteField(item)]: text || null })}
            onClose={(by) => actions.stopEdit(item, by === 'key')}
          />
        </div>
      ) : (
        <button
          type="button"
          tabIndex={tab}
          title={item.note ?? undefined}
          onClick={() => actions.startEdit(item, 'note')}
          className={cn(cellButton, 'w-full text-muted-foreground text-sm')}
        >
          {item.note ? (
            <span className="truncate">{item.note}</span>
          ) : (
            <Empty>{task ? 'комментарий' : 'кратко'}</Empty>
          )}
        </button>
      )}
      {folder && item.entity === 'project' && <FolderLink item={item} tab={tab} />}
    </>
  );
}

/** Where the project lies on the disk, always in sight; a click opens it in VS Code. */
function FolderLink({ item, tab }: { item: TreeItem; tab: number }) {
  const { folder, vscode } = usePlaces(item.project);
  if (!folder || !vscode) return null;
  return (
    <a
      href={vscode}
      tabIndex={tab}
      title={`Открыть в VS Code: ${folder}`}
      aria-label={`Открыть в VS Code: ${folder}`}
      className="ml-1.5 flex h-[1.625rem] w-fit max-w-full items-center gap-1 rounded-sm text-muted-foreground text-xs hover:text-foreground hover:underline"
    >
      <Folder aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{folder}</span>
    </a>
  );
}
