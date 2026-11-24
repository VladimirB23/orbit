/** The tree grid: rows, keyboard and the line for adding. */
import { Fragment } from 'react';
import type { Meta } from '@/api/types';
import type { Day } from '@/lib/dates';
import type { Row, TreeItem } from '@/lib/tree';
import { focusRow } from './focus';
import { QuickAdd } from './quick-add';
import { TreeRow } from './tree-row';
import type { RowActions } from './types';
import { addingPlace, type TreeUi, useRowKeys } from './use-row-keys';

interface Props {
  rows: Row[];
  today: Day;
  limits: Meta['limits'];
  ui: TreeUi;
  flashing: (row: Row) => boolean;
  actions: RowActions;
  onAddClose: (parent: TreeItem, refocus: boolean) => void;
  empty: React.ReactNode;
}

const HEADERS = [
  ['Название', 'pl-8'],
  ['Статус', 'pl-1.5'],
  ['Прогресс', 'col-progress pl-1.5'],
  ['Старт', 'col-start pl-1.5'],
  ['Срок', 'pl-1.5'],
  ['Комментарий', 'col-note pl-1.5'],
] as const;

export function TreeView(props: Props) {
  const { rows, today, limits, ui, flashing, actions, onAddClose, empty } = props;
  const { root, activeKey, onKeyDown } = useRowKeys({ rows, ui, actions });
  const place = addingPlace(rows, ui.adding);

  return (
    <div className="tree min-w-0 flex-1 overflow-auto">
      <div
        ref={root}
        role="treegrid"
        tabIndex={-1}
        aria-label="Проекты, этапы и задачи"
        aria-rowcount={rows.length + 1}
        onKeyDown={onKeyDown}
        className="outline-none"
      >
        <div
          role="row"
          className="tree-grid sticky top-0 z-25 h-8 border-border border-b bg-background px-3 text-muted-foreground text-xs"
        >
          {HEADERS.map(([title, className]) => (
            <div role="columnheader" key={title} className={className}>
              <span className={title === 'Статус' ? 'col-status-text' : undefined}>{title}</span>
            </div>
          ))}
          <div role="columnheader">
            <span className="sr-only">Действия</span>
          </div>
        </div>
        {rows.map((row, index) => (
          <Fragment key={row.item.key}>
            <TreeRow
              row={row}
              today={today}
              limits={limits}
              active={row.item.key === activeKey}
              selected={row.item.key === ui.selected}
              flash={flashing(row)}
              editing={ui.editing?.key === row.item.key ? ui.editing.cell : null}
              menu={ui.menu?.key === row.item.key ? ui.menu.name : null}
              actions={actions}
            />
            {place && ui.adding && index === place.after && (
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
            )}
          </Fragment>
        ))}
      </div>
      {rows.length === 0 && empty}
    </div>
  );
}
