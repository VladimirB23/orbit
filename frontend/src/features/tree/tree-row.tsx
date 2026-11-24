import { Folder } from 'lucide-react';
import type { Meta } from '@/api/types';
import { DateField } from '@/components/fields/date-field';
import { StatusMenu } from '@/components/fields/status-menu';
import { TextEditor } from '@/components/fields/text-editor';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { usePlaces } from '@/features/item/places';
import { noteField } from '@/features/item/use-edit';
import { type Day, dueHint } from '@/lib/dates';
import { isClosed, STATUS_LABEL } from '@/lib/status';
import type { Row, TreeItem } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { focusRow } from './focus';
import { ActionsMenu, cellButton, DateText, dueTone, Empty, TitleCell } from './row-parts';
import { ProgressBar } from './signals';
import type { CellMenu, RowActions, TextCell } from './types';

interface Props {
  row: Row;
  today: Day;
  limits: Meta['limits'];
  /** The only row reachable with Tab; arrows move between rows. */
  active: boolean;
  /** Open in the side panel. */
  selected: boolean;
  flash: boolean;
  editing: TextCell | null;
  menu: CellMenu | null;
  actions: RowActions;
}

export function TreeRow(props: Props) {
  const { row, today, limits, active, selected, flash, editing, menu, actions } = props;
  const { item } = row;
  const closed = isClosed(item.status);
  const isProject = item.entity === 'project';
  const tab = active ? 0 : -1;
  // Not to the trigger: there an arrow key would open the menu again instead of moving.
  const backToRow = (event: Event) => {
    event.preventDefault();
    focusRow(item.key);
  };
  const menuProps = (name: CellMenu) => ({
    open: menu === name,
    onOpenChange: (open: boolean) => actions.setMenu(item, open ? name : null),
    onCloseAutoFocus: backToRow,
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
        'tree-grid group/row relative min-h-9 border-line border-b px-3 outline-none hover:bg-raised/70',
        'focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]',
        isProject && 'min-h-11 border-t border-t-border',
        isProject && !row.open && 'border-b-transparent',
        selected && 'bg-selected hover:bg-selected',
        flash && 'animate-flash',
        (editing || menu) && 'z-20',
      )}
    >
      <TitleCell row={row} limits={limits} tab={tab} editing={editing} actions={actions} />

      <div role="gridcell" className="min-w-0">
        <StatusMenu
          value={item.status}
          onChange={(status) => void actions.save(item, { status })}
          {...menuProps('status')}
        >
          <button
            type="button"
            tabIndex={tab}
            aria-label={`Статус: ${STATUS_LABEL[item.status]}`}
            className={cn(cellButton, closed && 'text-muted-foreground')}
          >
            <OrbitGlyph status={item.status} className="col-status-glyph size-3.5" />
            <span className="col-status-text truncate text-sm">{STATUS_LABEL[item.status]}</span>
          </button>
        </StatusMenu>
      </div>

      <div role="gridcell" className="col-progress pl-1.5">
        {item.progress !== null && (
          <ProgressBar value={item.progress} label={`Прогресс: ${item.title}`} />
        )}
      </div>

      <div role="gridcell" className="col-start">
        <DateField
          label="Дата старта"
          value={item.startDate}
          today={today}
          onChange={(day) => void actions.save(item, { start_date: day })}
          {...menuProps('start')}
        >
          <button type="button" tabIndex={tab} className={cn(cellButton, 'text-sm')}>
            <DateText
              day={item.startDate}
              today={today}
              empty="старт"
              tone="text-muted-foreground"
            />
          </button>
        </DateField>
      </div>

      <div role="gridcell">
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
            {item.overdue && <span className="sr-only">просрочено</span>}
          </button>
        </DateField>
      </div>

      <div role="gridcell" className="col-note relative min-w-0">
        {editing === 'note' ? (
          <div className="absolute inset-x-0 top-1/2 z-30 -translate-y-[0.95rem]">
            <TextEditor
              label={item.entity === 'task' ? 'Комментарий' : 'Кратко'}
              initial={item.note ?? ''}
              limit={item.entity === 'task' ? limits.comment : limits.summary}
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
              <Empty>{item.entity === 'task' ? 'комментарий' : 'кратко'}</Empty>
            )}
          </button>
        )}
        {isProject && <FolderLink item={item} tab={tab} />}
      </div>

      <div role="gridcell" className="text-right">
        <ActionsMenu item={item} tab={tab} menu={menu} actions={actions} />
      </div>
    </div>
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
