/** Parts of a row that the tree and the timeline share. */
import { ChevronRight, Ellipsis, Plus } from 'lucide-react';
import type { Meta } from '@/api/types';
import { copyText } from '@/components/copy-button';
import { TextEditor } from '@/components/fields/text-editor';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { PriorityMark } from '@/components/priority-mark';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePlaces } from '@/features/item/places';
import { titleField } from '@/features/item/use-edit';
import { type Day, formatDay } from '@/lib/dates';
import { isClosed, PRIORITY_LABEL } from '@/lib/status';
import type { Row, TreeItem } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { focusRow } from './focus';
import { ProjectPulse, SignalChips } from './signals';
import type { CellMenu, RowActions, TextCell } from './types';

export const cellButton =
  'flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 text-left hover:bg-accent data-[state=open]:bg-accent';

export function dueTone(item: TreeItem): string {
  if (item.overdue) return 'font-medium text-danger';
  if (item.upcoming) return 'text-sun-ink';
  return 'text-muted-foreground';
}

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

/** A closing menu still holds the focus: start editors and dialogs right after it lets go. */
const later = (action: () => void) => () => setTimeout(action);

/** Back to the row, unless the chosen action has already taken the focus. */
const keepFocus = (item: TreeItem) => (event: Event) => {
  event.preventDefault();
  if (document.activeElement === document.body) focusRow(item.key);
};

interface TitleProps {
  row: Row;
  limits: Meta['limits'];
  tab: number;
  editing: TextCell | null;
  actions: RowActions;
  /** Buttons that lie over the end of the name on hover instead of taking its room. */
  overlay?: React.ReactNode;
}

/** Fold mark, status, name and what needs attention inside. */
export function TitleCell({ row, limits, tab, editing, actions, overlay }: TitleProps) {
  const { item } = row;
  const closed = isClosed(item.status);
  const isProject = item.entity === 'project';
  const archived = item.project?.archived_at != null;
  return (
    <div
      role="gridcell"
      className="relative flex min-w-0 items-center gap-1"
      style={{ paddingLeft: `calc(${row.depth} * var(--indent, 1.5rem))` }}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={row.open ? 'Свернуть' : 'Развернуть'}
        onClick={() => actions.toggle(item)}
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-md text-faint hover:bg-accent hover:text-foreground',
          !row.hasChildren && 'invisible',
        )}
      >
        <ChevronRight
          className={cn('size-4 transition-transform duration-150', row.open && 'rotate-90')}
        />
      </button>
      {isProject ? (
        <OrbitGlyph
          status={item.status}
          progress={item.progress ?? 0}
          className="mx-1.5 size-[1.15rem]"
        />
      ) : (
        <button
          type="button"
          tabIndex={tab}
          aria-label={closed ? `Вернуть в работу: ${item.title}` : `Готово: ${item.title}`}
          title={closed ? 'Вернуть в работу' : 'Отметить готовым'}
          onClick={() => actions.complete(item)}
          className="group/check grid size-7 shrink-0 place-items-center rounded-full hover:bg-accent"
        >
          <OrbitGlyph
            status={item.status}
            className="transition-transform group-hover/check:scale-115"
          />
        </button>
      )}
      {editing === 'title' ? (
        <TextEditor
          label="Название"
          initial={item.title}
          limit={item.entity === 'task' ? limits.title : limits.name}
          required
          onSave={(text) => actions.save(item, { [titleField(item)]: text })}
          onClose={(by) => actions.stopEdit(item, by === 'key')}
        />
      ) : (
        <>
          <span className={cn('flex min-w-0 flex-1 flex-col', isProject && 'py-1.5')}>
            <span className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                title={item.title}
                onClick={() => actions.open(item)}
                onDoubleClick={() => actions.startEdit(item, 'title')}
                className={cn(
                  'min-w-0 truncate rounded-sm text-left',
                  isProject ? 'font-semibold' : item.entity === 'milestone' && 'font-medium',
                  closed && 'font-normal text-muted-foreground',
                  item.status === 'canceled' && 'line-through',
                  !row.match && 'text-muted-foreground',
                )}
              >
                {item.title}
              </button>
              {(item.priority ?? 0) >= 3 && !closed && (
                <span
                  title={`Приоритет: ${PRIORITY_LABEL[item.priority ?? 0]}`}
                  className="shrink-0"
                >
                  <PriorityMark value={item.priority ?? 0} />
                  <span className="sr-only">Приоритет: {PRIORITY_LABEL[item.priority ?? 0]}</span>
                </span>
              )}
              {archived && (
                <span className="shrink-0 rounded-md bg-raised px-1.5 text-muted-foreground text-xs leading-5">
                  в архиве
                </span>
              )}
            </span>
            {isProject && !row.open && <ProjectPulse item={item} />}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1 pl-2">
            {!isProject && !row.open && <SignalChips item={item} compact />}
            {!overlay && <AddButton item={item} tab={tab} actions={actions} />}
          </span>
          {overlay && (
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 bg-raised pl-1 opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-aria-selected/row:bg-selected has-[[data-state=open]]:opacity-100">
              <AddButton item={item} tab={tab} actions={actions} />
              {overlay}
            </span>
          )}
        </>
      )}
    </div>
  );
}

interface MenuProps {
  item: TreeItem;
  tab: number;
  menu: CellMenu | null;
  actions: RowActions;
}

export function ActionsMenu({ item, tab, menu, actions }: MenuProps) {
  const archived = item.project?.archived_at != null;
  return (
    <DropdownMenu
      open={menu === 'actions'}
      onOpenChange={(open) => actions.setMenu(item, open ? 'actions' : null)}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={tab}
          aria-label={`Действия: ${item.title}`}
          className="grid size-7 place-items-center rounded-md text-faint opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
        >
          <Ellipsis className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <RowMenu item={item} archived={archived} actions={actions} />
    </DropdownMenu>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-faint opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
      {children}
    </span>
  );
}

export function DateText(props: { day: Day | null; today: Day; empty: string; tone: string }) {
  const { day, today, empty, tone } = props;
  if (day === null) return <Empty>{empty}</Empty>;
  return (
    <time dateTime={day} className={cn('truncate', tone)}>
      {formatDay(day, today)}
    </time>
  );
}

const addButton =
  'grid size-7 place-items-center rounded-md text-faint opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100';

function AddButton({ item, tab, actions }: { item: TreeItem; tab: number; actions: RowActions }) {
  if (item.entity !== 'project') {
    const label = item.entity === 'milestone' ? 'Добавить задачу' : 'Добавить подзадачу';
    return (
      <button
        type="button"
        tabIndex={tab}
        aria-label={label}
        title={label}
        onClick={() => actions.startAdd(item, 'task')}
        className={addButton}
      >
        <Plus className="size-4" />
      </button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" tabIndex={tab} aria-label="Добавить в проект" className={addButton}>
          <Plus className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onKeyDown={stop} onCloseAutoFocus={keepFocus(item)}>
        <DropdownMenuItem onSelect={later(() => actions.startAdd(item, 'milestone'))}>
          Этап <DropdownMenuShortcut>Shift+N</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={later(() => actions.startAdd(item, 'task'))}>
          Задача <DropdownMenuShortcut>N</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowMenu(props: { item: TreeItem; archived: boolean; actions: RowActions }) {
  const { item, archived, actions } = props;
  const isProject = item.entity === 'project';
  return (
    // Focus stays where the chosen action puts it: an editor, a dialog or a new line.
    <DropdownMenuContent
      align="end"
      className="min-w-52"
      onKeyDown={stop}
      onCloseAutoFocus={keepFocus(item)}
    >
      <DropdownMenuItem onSelect={() => actions.open(item)}>
        Открыть <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={later(() => actions.startEdit(item, 'title'))}>
        Переименовать <DropdownMenuShortcut>F2</DropdownMenuShortcut>
      </DropdownMenuItem>
      {isProject && (
        <DropdownMenuItem onSelect={later(() => actions.startAdd(item, 'milestone'))}>
          Добавить этап <DropdownMenuShortcut>Shift+N</DropdownMenuShortcut>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={later(() => actions.startAdd(item, 'task'))}>
        {item.entity === 'task' ? 'Добавить подзадачу' : 'Добавить задачу'}
        <DropdownMenuShortcut>N</DropdownMenuShortcut>
      </DropdownMenuItem>
      {isProject && <PlaceItems item={item} actions={actions} />}
      <DropdownMenuSeparator />
      {isProject ? (
        <DropdownMenuItem onSelect={() => actions.setArchived(item, !archived)}>
          {archived ? 'Вернуть из архива' : 'В архив'}
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem variant="destructive" onSelect={later(() => actions.remove(item))}>
          Удалить <DropdownMenuShortcut>Del</DropdownMenuShortcut>
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  );
}

function PlaceItems({ item, actions }: { item: TreeItem; actions: RowActions }) {
  const { folder, vscode, note } = usePlaces(item.project);
  if (!vscode && !note) return null;
  return (
    <>
      <DropdownMenuSeparator />
      {vscode && (
        <DropdownMenuItem onSelect={() => actions.openPlace(item, 'vscode')}>
          Открыть в VS Code <DropdownMenuShortcut>O</DropdownMenuShortcut>
        </DropdownMenuItem>
      )}
      {folder && (
        <DropdownMenuItem onSelect={() => void copyText(folder)}>
          Скопировать адрес папки
        </DropdownMenuItem>
      )}
      {note && (
        <DropdownMenuItem onSelect={() => actions.openPlace(item, 'note')}>
          Заметка в Obsidian <DropdownMenuShortcut>Shift+O</DropdownMenuShortcut>
        </DropdownMenuItem>
      )}
    </>
  );
}
