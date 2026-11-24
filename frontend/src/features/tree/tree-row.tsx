import type { Meta } from '@/api/types';
import type { Column } from '@/lib/columns';
import type { Day } from '@/lib/dates';
import type { Row } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { Cell, type MenuState } from './cells';
import { focusRow } from './focus';
import { ActionsMenu, TitleCell } from './row-parts';
import type { CellMenu, RowActions, TextCell } from './types';

interface Props {
  row: Row;
  columns: Column[];
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
  const { row, columns, today, limits, active, selected, flash, editing, menu, actions } = props;
  const { item } = row;
  const isProject = item.entity === 'project';
  const tab = active ? 0 : -1;
  const menuProps = (name: CellMenu): MenuState => ({
    open: menu === name,
    onOpenChange: (open: boolean) => actions.setMenu(item, open ? name : null),
    // Not to the trigger: there an arrow key would open the menu again instead of moving.
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      focusRow(item.key);
    },
  });
  const cell = { item, today, limits, tab, editing, menuProps, actions, folder: true };

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
      {columns.map(({ id }) => (
        <Cell key={id} id={id} {...cell} />
      ))}
      <div role="gridcell" className="text-right">
        <ActionsMenu item={item} tab={tab} menu={menu} actions={actions} />
      </div>
    </div>
  );
}
