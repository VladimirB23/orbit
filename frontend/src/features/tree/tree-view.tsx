/** The tree grid: rows, keyboard and the line for adding. */
import { Fragment, useRef } from 'react';
import type { Meta } from '@/api/types';
import { type Column, treeLayout } from '@/lib/columns';
import type { Day } from '@/lib/dates';
import type { Row, TreeItem } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { type Columns, ColumnsMenu, Resizer, useWidth, widthOfNames } from './columns';
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
  columns: Columns;
  onAddClose: (parent: TreeItem, refocus: boolean) => void;
  empty: React.ReactNode;
}

export function TreeView(props: Props) {
  const { rows, today, limits, ui, flashing, actions, columns, onAddClose, empty } = props;
  const { root, activeKey, onKeyDown } = useRowKeys({ rows, ui, actions });
  const place = addingPlace(rows, ui.adding);
  const box = useRef<HTMLDivElement>(null);
  const layout = treeLayout(columns.settings, useWidth(box));

  return (
    <div ref={box} className="tree min-w-0 flex-1 overflow-auto">
      <div
        ref={root}
        role="treegrid"
        tabIndex={-1}
        aria-label="Проекты, этапы и задачи"
        aria-rowcount={rows.length + 1}
        onKeyDown={onKeyDown}
        className="outline-none"
        style={{ '--fields': layout.template, minWidth: layout.minWidth } as React.CSSProperties}
      >
        <div
          role="row"
          className="tree-grid sticky top-0 z-25 h-8 border-border border-b bg-background px-3 text-muted-foreground text-xs"
        >
          <Header
            label="Название"
            className="pl-8"
            resizer={(current) =>
              layout.compact ? null : (
                <Resizer
                  id="name"
                  label="Название"
                  columns={columns}
                  current={current}
                  best={() => (root.current ? widthOfNames(root.current) : current())}
                />
              )
            }
          />
          {layout.columns.map((column) => (
            <Header
              key={column.id}
              label={column.label}
              className="pl-1.5"
              textClass={textClass(column)}
              resizer={(current) =>
                layout.compact ? null : (
                  <Resizer
                    id={column.id}
                    label={column.label}
                    columns={columns}
                    current={current}
                  />
                )
              }
            />
          ))}
          <div role="columnheader" aria-label="Действия" className="flex justify-end">
            <ColumnsMenu screen="tree" columns={columns} />
          </div>
        </div>
        {rows.map((row, index) => (
          <Fragment key={row.item.key}>
            <TreeRow
              row={row}
              columns={layout.columns}
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

const textClass = ({ id }: Column) => (id === 'status' ? 'col-status-text' : undefined);

interface HeaderProps {
  label: string;
  className: string;
  textClass?: string;
  resizer: (current: () => number) => React.ReactNode;
}

function Header({ label, className, textClass, resizer }: HeaderProps) {
  const cell = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={cell}
      role="columnheader"
      aria-label={label}
      className={cn('relative flex h-full min-w-0 items-center', className)}
    >
      <span className={cn('truncate', textClass)}>{label}</span>
      {resizer(() => cell.current?.offsetWidth ?? 0)}
    </div>
  );
}
